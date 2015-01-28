exports = module.exports = function(mongoose) {
  var jobSchema = new mongoose.Schema({
    type: {
      type: String,
      required: true,
      index: true
    },
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    description: {
      type: String,
      required: true
    },
    data: mongoose.Schema.Types.Mixed,
    state: {
      type: Number,
      default: 0, // 0 - registered, 1 - under processing, 2 - processed
      required: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400, // ttl in seconds
      required: true
    }
  });

  jobSchema.set('toObject', {
    transform: function(doc, ret, options) {
      // delete ret._id;
      delete ret.__v;
      // delete ret.createdAt; enable this if you do not want to update the expiry
    }
  });

  jobSchema.set('toJSON', {
    transform: function(doc, ret, options) {
      // delete ret._id;
      delete ret.__v;
      // delete ret.createdAt; enable this if you do not want to update the expiry
    }
  });

  // create the model for articles and return it
  return mongoose.model('job', jobSchema);
};
