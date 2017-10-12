# nedb-session-store
[![GitHub Latest Release](https://badge.fury.io/gh/JamesMGreene%2Fnedb-session-store.svg)](https://github.com/JamesMGreene/nedb-session-store) [![Build Status](https://secure.travis-ci.org/JamesMGreene/nedb-session-store.svg?branch=master)](https://travis-ci.org/JamesMGreene/nedb-session-store) [![Dependency Status](https://david-dm.org/JamesMGreene/nedb-session-store.svg?theme=shields.io)](https://david-dm.org/JamesMGreene/nedb-session-store) [![Dev Dependency Status](https://david-dm.org/JamesMGreene/nedb-session-store/dev-status.svg?theme=shields.io)](https://david-dm.org/JamesMGreene/nedb-session-store#info=devDependencies)


A session store implementation for [Express](http://expressjs.com/) & [Connect](https://github.com/senchalabs/connect) backed by an [NeDB](https://github.com/louischatriot/nedb) datastore (either in-memory or file-persisted).


## Compatibility

Supports integration with:

 - [Express](#express)
     - [`express@5.x`](#express5x)
     - [`express@4.x`](#express4x)
     - [`express@3.x`](#express3x)
     - [`express@2.x`](#express2x)
 - [Connect](#connect)
     - [`connect@3.x`](#connect3x)
     - [`connect@2.x`](#connect2x)
     - [`connect@1.x`](#connect1x) (technically `connect@>=1.0.3`)


## Getting Started

```shell
npm install --save nedb-session-store
```


## Usage

```js
// ...set up a Connect-compatible session/app...

var NedbStore = require('nedb-session-store')( connectCompatibleSession );

var store = new NedbStore({
  filename: 'path_to_nedb_persistence_file.db'
});
```

For further details on how to integrate this module with various Connect-compatible middleware environments (e.g. Express), see [Middleware Integration](#middleware-integration)


### Options

#### `defaultExpiry`

_Optional._ **[Date]** The default expiry period (max age) in milliseconds to use _if and ONLY if_ the session's expiration is not controlled by the session Cookie configuration. Defaults to 2 weeks.


#### `inMemoryOnly`

_Optional._ **[Boolean]** Only persist the datastore within the available in-process memory. Defaults to `false`.


#### `filename`

_Optional._ **[String]** The path to the file where the datastore will be persisted.  If not provided, the datastore will automatically be assigned the `filename` of `'data/sessions.db'`.

For more details about the underlying `filename` option, please read about it in the [NeDB documentation][].


#### `afterSerialization`

_Optional._ **[Function]** A hook that you can use to transform data after it was serialized and before it is written to disk. A common example usage for this hook is to encrypt data before writing the database to disk.

_**ONLY applies when your NeDB datastore is file-persisted!**_

For more details about the underlying `afterSerialization` option, please read about it in the [NeDB documentation][].


#### `beforeDeserialization`

_Optional._ **[Function]** The inverse of [`afterSerialization`](#afterserialization): a hook that you can use to transform data after it was read from disk and before it is deserialized. A common example usage for this hook is to decrypt data after reading the database from disk.

_**ONLY applies when your NeDB datastore is file-persisted!**_

For more details about the underlying `beforeDeserialization` option, please read about it in the [NeDB documentation][].


#### `corruptAlertThreshold`

_Optional._ **[Number]** NeDB will refuse to start if more than this percentage of the datafile is corrupt. Valid values must be a number between `0` (0%) and `1` (100%). A value of `0` means you do NOT tolerate any corruption, `1` means you do not care about corruption. NeDB uses a default value of `0.1` (10%).

_**ONLY applies when your NeDB datastore is file-persisted!**_

For more details about the underlying `corruptAlertThreshold` option, please read about it in the [NeDB documentation][].


#### `autoCompactInterval`

_Optional._ **[Number]** NeDB's file persistence uses an append-only format for performance reasons, meaning that all updates and deletes actual result in lines being _added_ at the end of the datastore file. To compact the file back into a 1-line-per-document format, you must either restart your application or specify an automatic compaction interval with this option. Valid values must be either `null` (disabled) or an integer between `5000` (5 seconds) and `86400000` (1 day). Defaults to 1 day.

_**ONLY applies when your NeDB datastore is file-persisted!**_

For more details about the underlying automatic compaction functionality, please read about it in the [NeDB documentation](https://github.com/louischatriot/nedb#persistence).



## Middleware Integration

### Express

#### `express@5.x`
#### `express@4.x`

To integrate with modern versions of Express (`4.x` and above):

```js
var sharedSecretKey = 'yoursecret';
var express = require('express');
var session = require('express-session');
var app = express();

var NedbStore = require('nedb-session-store')(session);

app.use(
  session({
    secret: sharedSecretKey,
    resave: false,
    saveUninitialized: false,
    cookie: {
      path: '/',
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000   // e.g. 1 year
    },
    store: new NedbStore({
      filename: 'path_to_nedb_persistence_file.db'
    })
  })
);
```


#### `express@3.x`
#### `express@2.x`

To integrate with deprecated versions of Express (`3.x` and `2.x`):

```js
var sharedSecretKey = 'yoursecret';
var express = require('express');
var app = express();

var NedbStore = require('nedb-session-store')(express);

app.use(express.cookieParser(sharedSecretKey));
app.use(
  express.session({
    secret: sharedSecretKey,
    resave: false,
    saveUninitialized: false,
    cookie: {
      path: '/',
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000   // e.g. 1 year
    },
    store: new NedbStore({
      filename: 'path_to_nedb_persistence_file.db'
    })
  })
);
```


### Connect

#### `connect@3.x`

To integrate with modern versions of Connect (`3.x` and above):

```js
var sharedSecretKey = 'yoursecret';
var connect = require('connect');
var session = require('express-session');
var app = connect();

var NedbStore = require('nedb-session-store')(session);

app.use(
  session({
    secret: sharedSecretKey,
    resave: false,
    saveUninitialized: false,
    cookie: {
      path: '/',
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000   // e.g. 1 year
    },
    store: new NedbStore({
      filename: 'path_to_nedb_persistence_file.db'
    })
  })
);
```


#### `connect@2.x`
#### `connect@1.x`

To integrate with deprecated versions of Connect (`2.x` and `1.x` (technically `>= 1.0.3`)):

```js
var sharedSecretKey = 'yoursecret';
var connect = require('connect');
var app = connect();

var NedbStore = require('nedb-session-store')(connect);

app.use(connect.cookieParser(sharedSecretKey));
app.use(
  connect.session({
    secret: sharedSecretKey,
    resave: false
    saveUninitialized: false,
    cookie: {
      path: '/',
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000   // e.g. 1 year
    },
    store: new NedbStore({
      filename: 'path_to_nedb_persistence_file.db'
    })
  })
);
```


## License

Copyright (c) 2015, James M. Greene @ Viavi Solutions, Inc. (MIT License)

This software was developed during the course of my work at [Viavi Solutions, Inc.](http://www.viavisolutions.com/) and has been publicly released with their permission.


<!--- RESOURCE LINKS -->

[NeDB documentation]: https://github.com/louischatriot/nedb#creatingloading-a-database
