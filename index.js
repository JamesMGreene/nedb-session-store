/**
 * A session store implementation for Connect & Express backed by an NeDB
 * datastore (either in-memory or file-persisted).
 *
 * For implementation requirements for Express 4.x and above, see:
 *   https://github.com/expressjs/session#session-store-implementation
 */

'use strict';

// Node.js core modules
var util = require('util');

// Userland modules
var NeDB = require('nedb');

// "Constants"
var ONE_DAY = 86400000;


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
  // connect.Store == Express 4.x
  // connect.session.Store == Express 3.x and Connect
  var Store = connect.Store || connect.session.Store;


  /**
   * Create a new session store, backed by an NeDB datastore
   * @constructor
   * @param {Object}   options                        Basically the options from https://github.com/louischatriot/nedb#creatingloading-a-database
   * @param {Boolean}  options.inMemoryOnly           The datastore will be in-memory only. Overrides `options.filename`.
   * @param {String}   options.filename               Relative file path where session data will be persisted; if none, datastore will be in-memory only.
   * @param {Function} options.afterSerialization     Optional serialization callback invoked before writing to file, e.g. for encrypting data.
   * @param {Function} options.beforeDeserialization  Optional deserialization callback invoked after reading from file, e.g. for decrypting data.
   * @param {Number}   options.corruptAfterThreshold  Optional threshold after which an error is thrown if too much data read from file is corrupt. Default: 0.1 (10%).
   * @param {Number}   options.autoCompactInterval    Optional interval in milliseconds at which to auto-compact file-based datastores. Valid range is 5000ms to 1 day. Pass `null` to disable.
   * @param {Function} options.onload                 Optional callback to be invoked when the datastore is loaded and ready.
   * @param {Function} callback                       Optional callback to be invoked when the datastore is loaded and ready. Overrides `options.onload`.
   */
  function NeDBStore( options, callback ) {
    var aci, onLoadFn,
      _self = this;

    if ( !(_self instanceof NeDBStore) ) {
      return new NeDBStore( options, callback );
    }

    options = options || {};

    // Remove this deprecated NeDB option from the `options` object, moreover because it is irrelevant for use
    // within Express middleware
    delete options.nodeWebkitAppName;

    // If the `inMemoryOnly` option was not provided, assign it a default value based on the presence of the `filename` option
    if ( typeof options.inMemoryOnly !== 'boolean' ) {
      options.inMemoryOnly = !options.filename;
    }

    // If the `filename` option was not provided but the `inMemoryOnly` option was falsy, emit an Error and bail out
    if ( !options.filename && !options.inMemoryOnly ) {
      _self.emit( 'error', new Error( 'NeDB datastore must either be in-memory or file-persisted but appropriate options were not specified' ) );
      return;
    }

    // If using an in-memory datastore, clear out the file-based options that no longer apply
    if ( options.inMemoryOnly ) {
      options.inMemoryOnly = true;
      options.filename = null;
      options.afterSerialization = null;
      options.beforeDeserialization = null;
      options.corruptAfterThreshold = undefined;
      options.autoCompactInterval = null;
    }

    // Ensure that any file-based datastore is automatically compacted at least once per day, unless specifically
    // set to `null`
    if ( options.autoCompactInterval !== null ) {
      aci = parseInt(options.autoCompactInterval, 10);
      options.autoCompactInterval = aci < 5000 ? 5000 : ( aci < ONE_DAY ? aci : ONE_DAY );
    }

    // Ensure that we track the time the record was created (`createdAt`) and last modified (`updatedAt`)
    options.timestampData = true;

    // Ensure that any file-based datastore starts loading immediately and signals when it is loaded
    options.autoload = true;
    onLoadFn = ( typeof callback === 'function' && callback ) || ( typeof options.onload === 'function' && options.onload ) || function() {};
    options.onload = function( err ) {
      if ( err ) {
        _self.emit( 'error', err );
      }
      _self.emit( ( err ? 'dis' : '' ) + 'connected' );
      onLoadFn( err );
    };

    // Apply the base constructor
    Store.call( _self, options );

    // Create the datastore (basically equivalent to an isolated Collection in MongoDB)
    _self.datastore = new NeDB( options );

    // Ensure that we continually compact the datafile, if using file-based persistence
    if ( !options.inMemoryOnly && options.filename ) {
      _self.datastore.persistence.setAutocompactionInterval( options.autoCompactInterval );
    }
  }


  // Inherit from Express's core session store
  util.inherits( NeDBStore, Store );


  /**
   * Create or update a single session's data
   */
  NeDBStore.prototype.set = function( sessionId, session, callback ) {
    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.update(
      { _id: sessionId },
      { $set: { session: session } },
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
  NeDBStore.prototype.touch = function( sessionId, callback ) {
    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.update(
      { _id: sessionId },
      { $set: { updatedAt: new Date() } },
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
    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.findOne(
      { _id: sessionId },
      function( err, existingDoc ) {
        return callback(
          err,
          ( existingDoc && existingDoc.session ) || null
        );
      }
    );
  };


  /**
   * Get ALL sessions' data
   */
  NeDBStore.prototype.all = function( callback ) {
    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.find(
      {},
      function( err, existingDocs ) {
        if ( err ) {
          return callback( err );
        }

        return callback(
          null,
          ( existingDocs || [] ).map(
            function( existingDoc ) {
              return existingDoc.session;
            }
          )
        );
      }
    );
  };


  /**
   * Count ALL sessions
   */
  NeDBStore.prototype.length = function( callback ) {
    // IMPORTANT: NeDB datastores auto-buffer their commands until the database is loaded
    this.datastore.count(
      {},
      function( err, count ) {
        return callback( err, count );
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
