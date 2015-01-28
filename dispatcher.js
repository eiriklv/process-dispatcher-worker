var debug = require('debug')('process-dispatcher-worker:dispatcher');
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
 * Some test data
 * for simulating
 * incoming jobs
 */
var testData = require('./test-data');

/**
 * Create streams for the channels
 * on which we want to
 * distribute / emit data.
 */
var incomingJobsChannel = InterprocessPullStream.Receiver({
  channel: 'jobs:incoming',
  prefix: config.get('database.redis.prefix'),
  url: config.get('database.redis.url')
});

var dispatchJobsChannel = InterprocessPullStream.Transmitter({
  channel: 'jobs:dispatch',
  prefix: config.get('database.redis.prefix'),
  url: config.get('database.redis.url')
});

var errorChannel = InterprocessPushStream.Transmitter({
  channel: 'jobs:errors', // this cannot be called 'error'!
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
var realSource = hl(incomingJobsChannel)
var testSource = hl(testData);

var incomingJobsStream = testSource
  .ratelimit(100, 10000)
  .compact()
  .flatten()
  .errors(emit('error'))

/**
 * Create a stream that
 * that registeres all
 * jobs in the database
 * returning it with a
 * unique id (ObjectId)
 *
 * Register only 10 jobs in parallel
 */
var registeredJobsStream = incomingJobsStream
  .fork()
  /**
   * save the job
   * in the database
   * and pass on the
   * result from mongoose
   */
  .map(hl.wrapCallback(
    models.Job.create.bind(models.Job)
  )).parallel(10)
  .errors(emit('error'))

/**
 * Connect to the database
 */
setup.connectToDatabase(
  mongoose,
  config.get('database.mongo.url')
);

/**
 * Log all the saved
 * articles and the
 * resulting entries in
 * mongodb
 */
registeredJobsStream
  .fork()
  .map(helpers.inspect(debug, 'registered-job-stream'))
  .pipe(dispatchJobsChannel)

/**
 * Pipe all errors
 * to the error channel
 */
errorStream
  .map(helpers.inspect(debug, 'error-stream'))
  .pipe(errorChannel)
