const fs = require('node:fs');
const path = require('node:path');

const datasetPath = path.join(__dirname, '..', 'data', 'nugen-weather-resort-alignment.jsonl');
const lines = fs.readFileSync(datasetPath, 'utf8').split(/\r?\n/).filter(Boolean);
const requiredOutputFields = [
  'occupancy_impact',
  'guest_demand',
  'outdoor_events',
  'nearby_attractions',
  'restaurant_demand',
  'staff_availability',
  'resource_utilization',
  'confidence',
  'assumptions',
];
const errors = [];

lines.forEach((line, index) => {
  try {
    const example = JSON.parse(line);
    if (!example.instruction || !example.input || !example.output) errors.push(`Line ${index + 1}: instruction, input and output are required`);
    requiredOutputFields.forEach((field) => {
      if (example.output?.[field] === undefined || example.output?.[field] === null) errors.push(`Line ${index + 1}: missing output.${field}`);
    });
    if (!example.input?.scenario_id?.startsWith('synthetic-')) errors.push(`Line ${index + 1}: scenario must be labeled synthetic`);
  } catch (error) {
    errors.push(`Line ${index + 1}: invalid JSON (${error.message})`);
  }
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${lines.length} Nugen alignment examples.`);
  console.log('Schema: instruction/input/output; required resort impact fields present.');
  console.log('Notice: examples are synthetic and are not historical operating outcomes.');
}
