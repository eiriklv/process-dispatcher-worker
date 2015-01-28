exports = module.exports = function(mongoose) {
  return {
    Job: require('./job')(mongoose)
  };
};
