import { registerRootComponent } from 'expo';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import App from './App';
import { ThemeProvider } from './theme';
import { FoxProvider } from './components/ui/FoxContext';

function AppRoot() {
	return (
		<SafeAreaProvider>
			<ThemeProvider>
				{/* Dark status-bar icons: every EA screen has a light background. */}
				<StatusBar style="dark" />
				<FoxProvider>
					<App />
				</FoxProvider>
			</ThemeProvider>
		</SafeAreaProvider>
	);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(AppRoot);
