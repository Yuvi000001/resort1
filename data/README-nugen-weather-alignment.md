# Nugen Weather-to-Resort Alignment

## Dataset

`nugen-weather-resort-alignment.jsonl` contains 12 initial domain examples. Each line is canonical JSON with:

- `instruction`: the model task and output contract
- `input`: weather and supplied resort context
- `output`: explainable operational assessment

Scenarios cover rainfall, temperature, storm duration, wind, occupancy, outdoor events, nearby attractions, restaurant demand, staffing, and resource utilization.

All current rows are explicitly synthetic examples. They are suitable for an initial demo alignment only; they are not measured Staylix outcomes and must not be presented as a validated forecasting dataset.

## Validate before upload

From `backend/` run:

```sh
npm run validate:nugen-dataset
```

Then check Nugen's alignment UI for its required file schema. Map each row to that schema if it differs from `instruction/input/output`; do not upload until the UI accepts the structure.

## Retry failed alignment

1. Open the failed alignment job and inspect its detailed error/log.
2. Confirm the selected base model supports the chosen alignment method and dataset format.
3. Validate the JSONL and remove malformed or empty rows if reported.
4. Retry with this dataset only after resolving the reported cause. If the failure reports resource/model-size limits, select a smaller supported base model in Nugen.
5. Test unseen cases covering light rain, prolonged storms, high wind, heat, and normal weather.
6. Confirm outputs include all required operational fields and avoid unsupported numeric certainty.

## Data needed for real forecasting

For measured occupancy/demand prediction, collect date-aligned historical records containing local weather observations/forecasts and actual outcomes. Recommended outcome fields include occupancy, booking changes/cancellations, event attendance, restaurant covers, guest request volumes, staff attendance, and resource usage. Keep training and evaluation dates separate.

For a 10-day synthetic demo fixture, run `npm run generate:weather-history:demo` from `backend/`. This writes `data/weather-resort-history-10d.synthetic.json` for the previous 10 completed UTC days, with clearly labelled mock weather and resort outcomes. It is only for UI, schema, and pipeline testing; never use it as observed history or to train/calibrate production models. Replace every value with date-aligned measured data before model training.

## Staylix inference integration gate

Do not describe the Nugen model as integrated or deployed until the alignment succeeds and Nugen provides its supported inference contract. Required integration details:

- deployed aligned model ID/name
- inference endpoint or SDK instructions
- authentication method and secret name
- request/response schema and limits
- model version and successful sample inference response

Store credentials only in `backend/.env`. The eventual flow should be: weather provider + current resort context -> deployed aligned Nugen model -> validated structured prediction -> Staylix intelligence UI. Keep official severe-weather advisories separate from model recommendations.

## Weather Digital Twin prototype

The manager-only `/digital-twin` view currently reads current/hourly weather from Open-Meteo and operational context from Staylix. Set `RESORT_LOCATION_NAME`, `RESORT_LATITUDE`, and `RESORT_LONGITUDE` in `backend/.env` to the actual property coordinates; the included Goan coordinates are a visibly marked demo default. Public traveler signals use Bluesky's public search endpoint and are displayed as unverified context, not as forecast input.

What-if outputs are an isolated, explainable heuristic simulation. They do not write bookings, occupancy, staffing, inventory, events, or other resort records. The existing occupancy regression supplies a baseline only; it is not a weather-trained model. Do not describe Nugen as integrated until its deployment and inference contract are available. Calibrated probabilities require date-aligned historical weather and actual resort outcomes. Follow official local alerts for safety decisions.

Run the pure simulation checks from `backend/` with `npm run test:weather-digital-twin`.
