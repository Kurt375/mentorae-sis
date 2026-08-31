const fs = require('fs');
const path = require('path');
const { RandomForestClassifier } = require('ml-random-forest');
const { RISK_LABELS, RISK_INDEX } = require('./features');

const MODEL_PATH = path.join(__dirname, 'model.json');

const FOREST_OPTIONS = {
  seed: 42,
  nEstimators: 150,
  maxFeatures: 1, // only 3 features total, use all of them per split
  replacement: true,
};

/**
 * Train a Random Forest on labeled samples.
 * @param {Array<{features: number[], label: 'Low'|'Medium'|'High'}>} samples
 * @returns {RandomForestClassifier}
 */
function train(samples) {
  const X = samples.map((s) => s.features);
  const y = samples.map((s) => RISK_INDEX[s.label]);
  const rf = new RandomForestClassifier(FOREST_OPTIONS);
  rf.train(X, y);
  return rf;
}

/** Persist a trained model + training metadata to disk. */
function save(rf, meta) {
  const payload = {
    model: rf.toJSON(),
    meta,
    trainedAt: new Date().toISOString(),
  };
  fs.writeFileSync(MODEL_PATH, JSON.stringify(payload));
  return payload;
}

/** Load the persisted model from disk. Returns null if none has been trained yet. */
function load() {
  if (!fs.existsSync(MODEL_PATH)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
    const rf = RandomForestClassifier.load(payload.model);
    return { rf, meta: payload.meta, trainedAt: payload.trainedAt };
  } catch (err) {
    console.error('riskModel.load: failed to load model.json', err);
    return null;
  }
}

/**
 * Predict risk label + confidence for one feature vector.
 * Confidence = the fraction of trees in the forest that voted for the
 * predicted class (ml-random-forest exposes this via predictProbability).
 */
function predictOne(rf, features) {
  const [labelIdx] = rf.predict([features]);
  const confidence = rf.predictProbability([features], labelIdx)[0];
  return { risk: RISK_LABELS[labelIdx], confidence };
}

module.exports = { train, save, load, predictOne, MODEL_PATH };
