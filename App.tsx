import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeNav from './app/index';
import Filters from './app/filters';
import Customize from './app/customize';
import Drive from './app/drive';
import Driving from './app/driving';
import Hiking from './app/hiking';
import Trail from './app/trail';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index"     component={HomeNav}  />
        <Stack.Screen name="filters"   component={Filters}  />
        <Stack.Screen name="customize" component={Customize} />
        <Stack.Screen name="drive"     component={Drive}    />
        <Stack.Screen name="driving"   component={Driving}  />
        <Stack.Screen name="hiking"    component={Hiking}   />
        <Stack.Screen name="trail"     component={Trail}    />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
