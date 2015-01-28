var debug = require('debug')('process-dispatcher-worker:dispatcher');
var asap = require('asap');
var hl = require('highland');
var _ = require('lodash');
var async = require('async');
var util = require('util');
var asyncify = require('asfy');
var EventEmitter = require('events').EventEmitter;
var mongoose = require('mongoose');
var helpers = require('./helpers');
var config = require('./config');
var setup = require('./setup');
var models = require('./models')(mongoose);
var InterprocessPullStream = require('interprocess-pull-stream');
var InterprocessPushStream = require('interprocess-push-stream');

/**
 * Create some curryed
 * helper functions to
 *
 * - check if two objects are equal (primitives as well)
 * - pick properties from objects
 */
var isEqual = hl.ncurry(2, _.isEqual);
var pick = hl.ncurry(2, hl.flip(_.pick));

/**
 * Create streams for the channels
 * on which we want to
 * distribute / emit data.
 */
var dispatchedJobsChannel = InterprocessPullStream.Receiver({
  channel: 'jobs:dispatch',
  prefix: config.get('database.redis.prefix'),
  url: config.get('database.redis.url')
});

var processedJobsChannel = InterprocessPushStream.Transmitter({
  channel: 'jobs:processed',
  prefix: config.get('database.redis.prefix'),
  url: config.get('database.redis.url')
});

var errorChannel = InterprocessPushStream.Transmitter({
  channel: 'jobs:errors',
  prefix: config.get('database.redis.prefix'),
  url: config.get('database.redis.url')
});

/**
 * Create a new event-emitter
 * which we are going to use
 * for errors
 *
 * We'll also make a curryed
 * version of eventEmitter.emit
 * that we'll use in our
 * application
 */
var eventEmitter = new EventEmitter();
var emit = hl.ncurry(2, eventEmitter.emit.bind(eventEmitter));

/**
 * Create an stream
 * where we'll
 * collect all the
 * errors emitted
 * throughout the
 * the stream pipeline(s)
 */
var errorStream = hl('error', eventEmitter);

/**
 * Create a stream
 * from our source
 * of choice
 * - limit the rate
 * - emit all errors via the event-emitter
 */
var jobStream = hl(dispatchedJobsChannel)
  .compact()
  .flatten()
  .errors(emit('error'))

/**
 * Create a stream that
 * processed all the
 * jobs and registeres
 * them as processed
 * in the database
 *
 * Process only 10 jobs in parallel
 */
var processedJobsStream = jobStream
  .fork()
  .filter(hl.compose(
    isEqual('the-right-work-type'),
    hl.get('type')
  ))
  /**
   * copy the object
   */
  .map(hl.flip(hl.extend)({}))
  /**
   * extend the object
   */
  .map(hl.extend({
    createdAt: Date.now(),
    state: 1
  }))
  /**
   * update the entry
   * in the database
   */
  .flatFilter(hl.wrapCallback(
    async.compose(
      asyncify(helpers.isTruthy),
      models.Job.update.bind(models.Job),
      helpers.formatForUpdate(['_id'])
    )
  ))
  /**
   * do some async processing
   * with the input data
   */
  .map(hl.wrapCallback(function(value, callback) {
    asap(callback.bind(this, null, value))
  })).parallel(5)
  /**
   * copy the object
   */
  .map(hl.flip(hl.extend)({}))
  /**
   * extend the object
   */
  .map(hl.extend({
    createdAt: Date.now(),
    state: 2
  }))
  /**
   * set the job as
   * processed in
   * the database
   */
  .flatFilter(hl.wrapCallback(
    async.compose(
      asyncify(helpers.isTruthy),
      models.Job.update.bind(models.Job),
      helpers.formatForUpdate(['_id'])
    )
  ))
  .errors(emit('error'))

/**
 * Connect to the database
 */
setup.connectToDatabase(
  mongoose,
  config.get('database.mongo.url')
);

/**
 * Log all the processed
 * jobs and distribute
 * the same data over a redis
 * channel so other processes
 * can listen for it
 */
processedJobsStream
  .fork()
  .map(helpers.inspect(debug, 'processed-jobs'))
  .pipe(processedJobsChannel)

/**
 * Pipe all errors
 * to the error channel
 */
errorStream
  .map(helpers.inspect(debug, 'error-stream'))
  .pipe(errorChannel)
