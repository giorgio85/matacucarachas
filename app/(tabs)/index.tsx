import { Audio } from 'expo-av';
import { Accelerometer } from 'expo-sensors';
import React, { useEffect, useState } from 'react';
import { Animated, Dimensions, ImageBackground, StyleSheet, Text } from 'react-native';
import squishSound from '../../assets/audios/splatter.mp3';
import aliveImg from '../../assets/images/cockroach.png';
import deadImg from '../../assets/images/cockroach_dead.png';
import havaianasImg from '../../assets/images/havaianas.png';
import tilesImg from '../../assets/images/tiles.png';

const { width, height } = Dimensions.get('window');

type Cockroach = {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  alive: boolean;
  opacity: Animated.Value;
  speed: number;
  size: number;
  speedX: number;
  speedY: number;
};

export default function App() {
  const [score, setScore] = useState(0);
  const [lastZ, setLastZ] = useState(0);
  const [cockroaches, setCockroaches] = useState<Cockroach[]>([]);
  const [shoeY] = useState(new Animated.Value(height - 550));

  const playSquish = async () => {
    const { sound } = await Audio.Sound.createAsync(squishSound);
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.isLoaded && !status.isPlaying) sound.unloadAsync();
    });
  };

  const spawnCockroach = () => {
    const size = Math.random() < 0.5 ? 80 : 50;
    const entrySide = Math.random(); // 0 = top, 1 = left, 2 = right

    let startX = 0, startY = 0, speedX = 10, speedY = 10;

    if (entrySide < 0.33) { // from top
      startX = Math.random() * (width - size);
      startY = -size;
      speedX = (Math.random() - 0.5) * 6; // zigzag
      speedY = Math.random() * 8 + 4;
    } else if (entrySide < 0.66) { // from left
      startX = -size;
      startY = Math.random() * (height - 150);
      speedX = Math.random() * 8 + 4;
      speedY = (Math.random() - 0.5) * 6;
    } else { // from right
      startX = width + size;
      startY = Math.random() * (height - 150);
      speedX = -(Math.random() * 8 + 4);
      speedY = (Math.random() - 0.5) * 6;
    }

    setCockroaches(prev => {
      const aliveCockroaches = prev.filter(c => c.alive);
      if (aliveCockroaches.length >= 15) return prev; // Limit only alive cockroaches
      return [
        ...prev,
        {
          id: Date.now() + Math.random(),
          x: new Animated.Value(startX),
          y: new Animated.Value(startY),
          alive: true,
          opacity: new Animated.Value(1),
          speed: Math.random() * 60 + 20,
          size,
          speedX,
          speedY
        }
      ];
    });
  };

  const moveCockroaches = () => {
    setCockroaches(prev => {
      return prev.map(c => {
        if (!c.alive) return c;

        // Calculate direction towards the havaianas
        const shoeX = 0 + 170; // Center of the havaianas (left + half width)
        const shoeYValue = (shoeY as any)._value + 320; // Center of the havaianas (top + half height)

        const deltaX = shoeX - (c.x as any)._value;
        const deltaY = shoeYValue - (c.y as any)._value;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Randomly change direction slightly while still heading towards the havaianas
        const randomFactor = Math.random() * 0.5 - 0.25; // Random adjustment factor
        c.speedX = (deltaX / distance) * (Math.random() * 8 + 4) + randomFactor;
        c.speedY = (deltaY / distance) * (Math.random() * 8 + 4) + randomFactor;

        let newX = (c.x as any)._value + c.speedX;
        let newY = (c.y as any)._value + c.speedY;

        // Use Animated.spring for smoother movement
        Animated.spring(c.x, {
          toValue: newX,
          speed: 2,
          bounciness: 0,
          useNativeDriver: false
        }).start();
        Animated.spring(c.y, {
          toValue: newY,
          speed: 2,
          bounciness: 0,
          useNativeDriver: false
        }).start();

        return c;
      });
    });
  };

  useEffect(() => {
    Accelerometer.setUpdateInterval(50);
    const subscription = Accelerometer.addListener(accelData => {
      const deltaZ = Math.abs(accelData.z - lastZ);
      if (deltaZ > 1.5) killCockroach();
      setLastZ(accelData.z);
    });
    return () => subscription && subscription.remove();
  }, [lastZ, cockroaches]);

  const killCockroach = () => {
    setCockroaches(prev => {
      const idx = prev.findIndex(c => c.alive && isUnderHavaiana(c));
      if (idx !== -1) {
        const updated = [...prev];
        const c = updated[idx];
        c.alive = false;
        Animated.timing(c.opacity, { toValue: 0, duration: 500, useNativeDriver: false }).start();
        setScore(s => s + (c.size === 50 ? 2 : 1));
        playSquish();

        Animated.sequence([
          Animated.timing(shoeY, { toValue: height - 350, duration: 100, useNativeDriver: false }),
          Animated.timing(shoeY, { toValue: height - 450, duration: 100, useNativeDriver: false })
        ]).start();

        return updated;
      }
      return prev;
    });
  };

  const isUnderHavaiana = (c: Cockroach) => {
    const shoeLeft = 0;
    const shoeRight = 340;
    const shoeTop = (shoeY as any)._value;
    const shoeBottom = shoeTop + 640 * 0.6;

    const cockLeft = (c.x as any)._value;
    const cockRight = cockLeft + c.size;
    const cockTop = (c.y as any)._value;
    const cockBottom = cockTop + c.size * 0.6;

    return !(cockRight < shoeLeft || cockLeft > shoeRight || cockBottom < shoeTop || cockTop > shoeBottom);
  };

  useEffect(() => {
    const interval = setInterval(spawnCockroach, 800); // Infinite spawning
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(moveCockroaches, 100);
    return () => clearInterval(interval);
  }, [cockroaches]);

  return (
    <ImageBackground source={tilesImg} style={styles.container}>
      <Text style={styles.score}>Puntuación: {score}</Text>
      {cockroaches.map(c => (
        <Animated.Image
          key={c.id}
          source={c.alive ? aliveImg : deadImg}
          style={[
            styles.cockroach,
            {
              left: c.x,
              top: c.y,
              opacity: c.opacity,
              width: c.size,
              height: c.size * 0.6
            }
          ]}
        />
      ))}
      <Animated.Image
        source={havaianasImg}
        style={[
          styles.havaianas,
          { top: shoeY, left: 0, width: 340, height: 640 * 0.6 }
        ]}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 },
  score: { color: '#130202c1', fontSize: 22, textAlign: 'center', marginBottom: 20 },
  cockroach: { position: 'absolute' },
  havaianas: { position: 'absolute', zIndex: 10 }
});
