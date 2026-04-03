// API endpoint for Pulse audio stations (Node.js Express style)
const pulseStations = require('../functions/pulse-stations.js');

module.exports = async function handlePulseStations(req, res) {
  return pulseStations(req, res);
};
