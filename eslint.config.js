import { configs, ts_config } from '@ryanatkn/eslint-config';

ts_config.rules['no-console'] = 1;
// the diff model's methods are prototype methods, so detaching one loses `this`
ts_config.rules['@typescript-eslint/unbound-method'] = 2;

export default configs;
