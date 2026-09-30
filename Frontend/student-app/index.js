import { registerRootComponent } from 'expo';
import React from 'react';

import App from './App';
import { ThemeProvider } from './theme';

function AppRoot() {
	return (
		<ThemeProvider>
			<App />
		</ThemeProvider>
	);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(AppRoot);
