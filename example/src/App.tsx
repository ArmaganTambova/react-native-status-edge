import { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import StatusEdge, { useStatusEdge } from 'react-native-status-edge';

function MainContent() {
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState('#000000'); // Default to black for visibility on white
  const data = useStatusEdge();

  return (
    <View style={styles.container}>
      {/* The StatusEdge component sits on top absolutely positioned */}
      <StatusEdge isLoading={loading} color={color} />

      <SafeAreaView style={styles.content}>
        <Text style={styles.title}>Status Edge</Text>
        <Text style={styles.subtitle}>Cutout Detection & Animation</Text>

        <View style={styles.card}>
            <Text style={styles.infoTitle}>Device Info</Text>
            <Text style={styles.infoText}>
                {data ? JSON.stringify(data, null, 2) : "Loading data..."}
            </Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => setLoading(!loading)}
          >
            <Text style={styles.buttonText}>{loading ? "Stop Loading" : "Start Loading"}</Text>
          </TouchableOpacity>

          <View style={styles.colorRow}>
            <TouchableOpacity style={[styles.colorButton, { backgroundColor: '#000000' }]} onPress={() => setColor('#000000')} />
            <TouchableOpacity style={[styles.colorButton, { backgroundColor: '#FF3B30' }]} onPress={() => setColor('#FF3B30')} />
            <TouchableOpacity style={[styles.colorButton, { backgroundColor: '#007AFF' }]} onPress={() => setColor('#007AFF')} />
            <TouchableOpacity style={[styles.colorButton, { backgroundColor: '#34C759' }]} onPress={() => setColor('#34C759')} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Modern white theme
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  card: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 40,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#444',
  },
  controls: {
    width: '100%',
    gap: 20,
    alignItems: 'center',
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#000',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10,
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#EEE',
  }
});
