/**
 * A session store implementation for Connect & Express backed by an NeDB
 * datastore (either in-memory or file-persisted).
 *
 * For implementation requirements for Express 4.x and above, see:
 *   https://github.com/expressjs/session#session-store-implementation
 */

'use strict';

// Node.js core modules
var path = require('path');
var util = require('util');

// Userland modules
var NeDB = require('nedb');

// "Constants"
var ONE_DAY = 86400000;
var TWO_WEEKS = 14 * ONE_DAY;


/**
 * Returns a constructor with the specified Connect middleware's Store class as
 * its prototype.
 *
 * @param {Function} connect Connect-compatible session middleware (e.g. Express 3.x, express-session)
 * @api public
 */
module.exports = function( connect ) {

  /**
   * Express and/or Connect's session Store
   */
  // connect.Store => Express 5.x/4.x and Connect 3.x with `require('express-session')`
  // connect.session.Store => Express 3.x/2.x and Connect 2.x/1.x  with `express`
  var Store = connect.Store || connect.session.Store;


  /**
   * Create a new session store, backed by an NeDB datastore
   * @constructor
   * @param {Object}   options                        Primarily a subset of the options from https://github.com/louischatriot/nedb#creatingloading-a-database
   * @param {Number}   options.defaultExpiry          The default expiry period (max age) in milliseconds to use if the session's expiry is not controlled by the session cookie configuration. Default: 2 weeks.
   * @param {Boolean}  options.inMemoryOnly           The datastore will be in-memory only. Overrides `options.filename`.
   * @param {String}   options.filename               Relative file path where session data will be persisted; if none, a default of 'data/sessions.db' will be used.
   * @param {Function} options.afterSerialization     Optional serialization callback invoked before writing to file, e.g. for encrypting data.
   * @param {Function} options.beforeDeserialization  Optional deserialization callback invoked after reading from file, e.g. for decrypting data.
   * @param {Number}   options.corruptAlertThreshold  Optional threshold after which an error is thrown if too much data read from file is corrupt. Default: 0.1 (10%).
   * @param {Number}   options.autoCompactInterval    Optional interval in milliseconds at which to auto-compact file-based datastores. Valid range is 5000ms to 1 day. Pass `null` to disable.
   * @param {Function} options.onload                 Optional callback to be invoked when the datastore is loaded and ready.
   */
  function NeDBStore( options ) {
    var onLoadFn, aci,
        _this = this;

    if ( !(_this instanceof NeDBStore) ) {
      return new NeDBStore( options );
    }

    options = options || {};

    // Remove this deprecated NeDB option from the `options` object, moreover because it is irrelevant for use
    // within Express middleware
    delete options.nodeWebkitAppName;

    // Ensure that the `inMemoryOnly` option is a Boolean
    options.inMemoryOnly = !!options.inMemoryOnly;

    // If the `inMemoryOnly` option was falsy...
    if ( !options.inMemoryOnly ) {
      // ...and the `filename` option is falsy, provide a default value for the `filename` option
      options.filename = options.filename || path.join('data', 'sessions.db');
    }
    else {
      // Otherwise (if using an in-memory datastore), clear out the file-based options as they no longer apply
      options.filename = null;
      options.afterSerialization = null;
      options.beforeDeserialization = null;
      options.corruptAlertThreshold = undefined;
      options.autoCompactInterval = null;
    }

    // Ensure some default expiry period (max age) is specified
    _this._defaultExpiry =
      (
        typeof options.defaultExpiry === 'number' &&
        Number.isFinite(options.defaultExpiry) &&
        options.defaultExpiry > 0
      ) ?
        parseInt(options.defaultExpiry, 10) :
        TWO_WEEKS;
    delete options.defaultExpiry;

    // Ensure that any file-based datastore is automatically compacted at least once per day, unless specifically
    // set to `null`
    if ( options.autoCompactInterval !== null ) {
      aci = parseInt(options.autoCompactInterval, 10);
      aci = aci < 5000 ? 5000 : ( aci < ONE_DAY ? aci : ONE_DAY );
    }
    else {
      aci = null;
    }
    delete options.autoCompactInterval;

    // Ensure that we track the time the record was created (`createdAt`) and last modified (`updatedAt`)
    options.timestampData = true;

    // Ensure that any file-based datastore starts loading immediately and signals when it is loaded
    options.autoload = true;
    onLoadFn = typeof options.onload === 'function' ? options.onload : function() {};
    options.onload = function( err ) {
      if ( err ) {
        _this.emit( 'error', err );
      }
      // The "express-session" core module listens to the "connect" and "disconnect" event names
      _this.emit( ( err ? 'dis' : '' ) + 'connect' );
      onLoadFn( err );
    };

    // Apply the base constructor
    Store.call( _this, options );

    // Create the datastore (basically equivalent to an isolated Collection in MongoDB)
    _this.datastore = new NeDB( options );

    // Ensure that we continually compact the datafile, if using file-based persistence
    if ( options.filename && aci !== null ) {
      _this.datastore.persistence.setAutocompactionInterval( aci );
    }
  }


  // Inherit from Connect/Express's core session store
  util.inherits( NeDBStore, Store );


  /**
   * Create or update a single session's data
   */
  NeDBStore.prototype.set = function( sessionId, session, callback ) {
    // Handle rolling expiration dates
    var expirationDate;
    if ( session && session.cookie && session.cookie.expires ) {
      expirationDate = new Date( session.cookie.expires );
    }
    else {
      expirationDate = new Date( Date.now() + this._defaultExpiry );
    }

    // Ensure that the Cookie in the `session` is safely serialized
    var sess = {};
    Object.keys( session ).forEach(function( key ) {
      if ( key === 'cookie' && typeof session[key].toJSON === 'function' ) {
        sess[key] = session[key].toJSON();
      }
      else {
        sess[key] = session[key];
      }
    });

    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.update(
      { _id: sessionId },
      { $set: { session: sess, expiresAt: expirationDate } },
      { multi: false, upsert: true },
      function( err, numAffected, newDoc ) {
        if ( !err && numAffected === 0 && !newDoc ) {
          err = new Error( 'No Session exists with ID ' + JSON.stringify(sessionId) );
        }
        return callback( err );
      }
    );
  };


  /**
   * Touch a single session's data to update the time of its last access
   */
  NeDBStore.prototype.touch = function( sessionId, session, callback ) {
    var touchSetOp = { updatedAt: new Date() };

    // Handle rolling expiration dates
    if ( session && session.cookie && session.cookie.expires ) {
      touchSetOp.expiresAt = new Date( session.cookie.expires );
    }

    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.update(
      { _id: sessionId },
      { $set: touchSetOp },
      { multi: false, upsert: false },
      function( err, numAffected ) {
        if ( !err && numAffected === 0 ) {
          err = new Error( 'No Session exists with ID ' + JSON.stringify(sessionId) );
        }
        return callback( err );
      }
    );
  };


  /**
   * Get a single session's data
   */
  NeDBStore.prototype.get = function( sessionId, callback ) {
    var _this = this;

    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.findOne(
      { _id: sessionId },
      function( err, existingDoc ) {
        if ( err ) {
          return callback( err, null );
        }
        else if ( existingDoc ) {
          // If the existing record does not have an expiration and/or has not yet expired, return it
          if ( existingDoc.session && !existingDoc.expiresAt || new Date() < existingDoc.expiresAt ) {
            return callback( null, existingDoc.session );
          }
          // Otherwise it is an expired session, so destroy it!
          else {
            return _this.destroy(
              sessionId,
              function( destroyErr ) {
                callback( destroyErr, null );
              }
            );
          }
        }
        return callback( null, null );
      }
    );
  };


  /**
   * Get ALL sessions' data
   */
  NeDBStore.prototype.all = function( callback ) {
    var _this = this;

    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    _this.datastore.find(
      {},
      function( err, existingDocs ) {
        if ( err ) {
          return callback( err, null );
        }

        return callback(
          null,
          ( existingDocs || [] )
            .filter(function( existingDoc ) {
              // If the existing record does not have an expiration and/or has not yet expired, keep it in the result list
              if ( existingDoc.session && !existingDoc.expiresAt || new Date() < existingDoc.expiresAt ) {
                return true;
              }
              // Otherwise it is an expired session, so destroy it! ...AND remove it from the result list
              else {
                // NOTE: The following action makes this `filter`-ing callback an impure function as it has side effects (removing stale sessions)!
                _this.destroy(
                  existingDoc._id,
                  function( destroyErr ) {
                    if ( destroyErr ) {
                      // Give consumers a way to observe these `destroy` failures, if desired
                      _this.emit( 'error', destroyErr );
                    }
                  }
                );
                return false;
              }
            })
            .map(function( existingDoc ) {
              return existingDoc.session;
            })
        );
      }
    );
  };


  /**
   * Count ALL sessions
   */
  NeDBStore.prototype.length = function( callback ) {
    // While using `this.all` is much less performant than using `this.datastore.count`,
    // it DOES, however, also filter out (and destroy) any stale session records first,
    // thus resulting in a more accurate final count.

    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.all(
      function( err, sessions ) {
        callback( err, ( sessions || [] ).length );
      }
    );
  };


  /**
   * Remove a single session
   */
  NeDBStore.prototype.destroy = function( sessionId, callback ) {
    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.remove(
      { _id: sessionId },
      { multi: false },
      function( err /*, numRemoved */ ) {
        return callback( err );
      }
    );
  };


  /**
   * Remove ALL sessions
   */
  NeDBStore.prototype.clear = function( callback ) {
    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.remove(
      {},
      { multi: true },
      function( err /*, numRemoved */ ) {
        return callback( err );
      }
    );
  };


  return NeDBStore;
};
