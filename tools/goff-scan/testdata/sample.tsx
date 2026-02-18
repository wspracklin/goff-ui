import { useBooleanFlagValue, useStringFlagValue, useNumberFlagValue, useObjectFlagValue } from '@openfeature/react-sdk';

function App() {
  const darkMode = useBooleanFlagValue('dark-mode', false);
  const theme = useStringFlagValue('theme-name', 'light');
  const maxItems = useNumberFlagValue('max-items', 10);
  const config = useObjectFlagValue('ui-config', {});

  // Also test client.getXxx style
  const client = OpenFeature.getClient();
  const enabled = client.getBooleanValue('feature-x', false);
  const label = client.getStringValue('button-label', 'Click');
  const limit = client.getNumberValue('rate-limit', 100);
  const settings = client.getObjectValue('app-settings', {});

  return <div>{darkMode ? 'Dark' : 'Light'}</div>;
}
