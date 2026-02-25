import { useState } from 'react';
import { View, StyleSheet, Button, Text, SafeAreaView } from 'react-native';
import StatusEdge, { useStatusEdge } from 'react-native-status-edge';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState('#00FF00');
  const data = useStatusEdge();

  return (
    <View style={styles.container}>
      {/* The StatusEdge component sits on top absolutely positioned */}
      <StatusEdge isLoading={loading} color={color} />

      <SafeAreaView style={styles.content}>
        <Text style={styles.text}>Status Edge Example</Text>
        <Text style={styles.info}>{data ? JSON.stringify(data, null, 2) : "Loading data..."}</Text>

        <View style={styles.controls}>
          <Button title={loading ? "Stop Loading" : "Start Loading"} onPress={() => setLoading(!loading)} />
          <View style={styles.row}>
            <Button title="Green" onPress={() => setColor('#00FF00')} />
            <Button title="Blue" onPress={() => setColor('#0000FF')} />
            <Button title="Red" onPress={() => setColor('#FF0000')} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Black background to see glow nicely
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFF',
    fontSize: 20,
    marginBottom: 20,
  },
  info: {
    color: '#AAA',
    fontSize: 10,
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  controls: {
    gap: 10,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  }
});
