import { Accelerometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [kills, setKills] = useState(0);
  const [lastZ, setLastZ] = useState(0);
  const [cucarachas, setCucarachas] = useState([]);

  // Genera cucarachas aleatorias
  const spawnCucaracha = () => {
    setCucarachas(prev => [
      ...prev,
      {
        id: Date.now(),
        x: Math.random() * (width - 50),
        y: Math.random() * (height - 150),
        alive: true
      }
    ]);
  };

  // Detecta golpe
  useEffect(() => {
    Accelerometer.setUpdateInterval(50);
    const subscription = Accelerometer.addListener(accelData => {
      const deltaZ = Math.abs(accelData.z - lastZ);
      if (deltaZ > 1.5) { // Umbral de golpe
        matarCucaracha();
      }
      setLastZ(accelData.z);
    });
    return () => subscription && subscription.remove();
  }, [lastZ, cucarachas]);

  // Mata una cucaracha aleatoria
  const matarCucaracha = () => {
    setCucarachas(prev => {
      const idx = prev.findIndex(c => c.alive);
      if (idx !== -1) {
        const nuevas = [...prev];
        nuevas[idx].alive = false;
        setKills(k => k + 1);
        return nuevas;
      }
      return prev;
    });
  };

  // Spawnear cucarachas cada 2 segundos
  useEffect(() => {
    const interval = setInterval(spawnCucaracha, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.score}>Cucarachas eliminadas: {kills}</Text>
      {cucarachas.map(c => (
        <View
          key={c.id}
          style={[
            styles.cucaracha,
            {
              left: c.x,
              top: c.y,
              backgroundColor: c.alive ? 'brown' : 'gray'
            }
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
    paddingTop: 40
  },
  score: {
    color: '#fff',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 20
  },
  cucaracha: {
    position: 'absolute',
    width: 40,
    height: 20,
    borderRadius: 10
  }
});