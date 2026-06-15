import { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import StatusEdge, {
  useStatusEdge,
  type AnimationStyle,
} from 'react-native-status-edge';

const ANIMATIONS: AnimationStyle[] = [
  'trace',
  'clockwise',
  'counterclockwise',
  'breathing',
  'pulse',
];

const COLORS = ['#000000', '#FF3B30', '#007AFF', '#34C759'];

function MainContent() {
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState('#000000');
  const [animation, setAnimation] = useState<AnimationStyle>('trace');
  const data = useStatusEdge();

  return (
    <View style={styles.container}>
      {/* Full-screen overlay, drawn on top around the cutout */}
      <StatusEdge isLoading={loading} color={color} animation={animation} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Headroom keeps the top-edge animation clear of the UI */}
          <View style={styles.headroom} />

          <Text style={styles.title}>Status Edge</Text>
          <Text style={styles.subtitle}>Cutout Detection & Animation</Text>

          <View style={styles.detectedPill}>
            <Text style={styles.detectedLabel}>DETECTED</Text>
            <Text style={styles.detectedValue}>
              {data ? data.cutoutType : '…'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => setLoading((v) => !v)}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Stop Loading' : 'Start Loading'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>Animation</Text>
          <View style={styles.animationRow}>
            {ANIMATIONS.map((name) => (
              <TouchableOpacity
                key={name}
                style={[styles.chip, animation === name && styles.chipActive]}
                onPress={() => setAnimation(name)}
              >
                <Text
                  style={[
                    styles.chipText,
                    animation === name && styles.chipTextActive,
                  ]}
                >
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.colorRow}>
            {COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorButton,
                  { backgroundColor: c },
                  color === c && styles.colorButtonActive,
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </ScrollView>
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
    backgroundColor: '#FFFFFF',
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 56,
    gap: 18,
  },
  // Clear space at the top so the cutout animation is fully visible.
  headroom: {
    height: 72,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  detectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F2F2F4',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  detectedLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 1.2,
  },
  detectedValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    minWidth: 220,
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#AAA',
    letterSpacing: 1.2,
    marginTop: 8,
  },
  animationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#FAFAFA',
  },
  chipActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  chipText: {
    fontSize: 13,
    color: '#444',
  },
  chipTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 15,
  },
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#EEE',
  },
  colorButtonActive: {
    borderColor: '#000',
    borderWidth: 3,
  },
});
