import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeNav from './app/index';
import Customize from './app/customize';
import Drive from './app/drive';
import { ThemeProvider } from './src/design/theme';
import { useAppFonts } from './src/design/fonts';
import DesignSystemScreen from './src/design/DesignSystemScreen';
import ComponentsDemoScreen from './src/components/ComponentsDemoScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  // Fail-fast gate: don't render the navigator until fonts have resolved.
  // The font map in src/design/fonts.ts is intentionally empty until assets
  // ship — useAppFonts() returns [true, null] immediately in that state.
  const [fontsLoaded] = useAppFonts();
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index"           component={HomeNav}              />
            <Stack.Screen name="customize"       component={Customize}            />
            <Stack.Screen name="drive"           component={Drive}                />
            <Stack.Screen name="design-system"   component={DesignSystemScreen}   />
            <Stack.Screen name="components-demo" component={ComponentsDemoScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
