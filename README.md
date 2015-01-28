Process-dispatcher-worker
=========================

#### Introduction:
A(n opinionated) boilerplate for processing stuff using streams, channels and persistent storage.

#### Environment variables:
* `DEBUG` - Debug output (* for all) (optional)
 * example: `*`
* `NODE_ENV` - Environment ('development', 'staging', 'production')
 * example: `development`
* `MONGO_URL` - MongoDB url (including authentication)
 * example: `mongodb://user:pass@localhost:27017/mydatabase`
* `REDIS_URL` - Redis url (including authentication)
 * example: `redis://user:pass@localhost:6379`
* `REDIS_PREFIX` - Prefix for redis channels
 * example: `app1:`

#### Development shellscript example for `dispatcher.js`:
```sh
#!/bin/sh

export DEBUG="*" \
export NODE_ENV="development" \
export MONGO_URL="mongodb://localhost/collectify" \
export REDIS_URL='redis://localhost:6379' \

node dispatcher
```

#### Development shellscript example for `worker.js`:
```sh
#!/bin/sh

export DEBUG="*" \
export NODE_ENV="development" \
export MONGO_URL="mongodb://localhost/collectify" \
export REDIS_URL='redis://localhost:6379' \

node worker
```

#### Todo:
* add `StreamBufferMonitor`
* add automatic scaling via cluster-forking or Heroku API
* add automatic redo of abandoned jobs using mongoose as a source
* add lightweight web-server with websockets for realtime monitoring
