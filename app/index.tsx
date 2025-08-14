import { Audio } from 'expo-av';
import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, ImageBackground, StyleSheet, Text, Image } from 'react-native';
import squishSound from '../assets/audios/splatter.mp3';
import aliveImg from '../assets/images/cockroach.png';
import deadImg from '../assets/images/cockroach_dead.png';
import havaianasImg from '../assets/images/havaianas.png';
import tilesImg from '../assets/images/tiles.png';

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
  const cockroachesRef = useRef<Cockroach[]>([]);
  const [score, setScore] = useState(0);
  const [lastZ, setLastZ] = useState(0);
  const [shoeY] = useState(new Animated.Value(height - 550));
  
  // Performance: Memoize constants for smoother gameplay
  const gameConstants = useMemo(() => ({
    maxCockroaches: 20, // Increased for more action
    spawnInterval: 400, // Faster spawning for more fluid gameplay
    moveInterval: 16, // 60 FPS movement for smooth animation
    accelerometerInterval: 16, // 60 FPS accelerometer for responsive controls
    hitThreshold: 1.2, // Slightly more sensitive for better feel
    shoeDimensions: {
      left: 0,
      right: 340,
      height: 640 * 0.6
    }
  }), []);

  // Performance: Memoize the playSquish function
  const playSquish = useCallback(async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(squishSound);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && !status.isPlaying) sound.unloadAsync();
      });
    } catch (error) {
      console.log('Audio error:', error);
    }
  }, []);

  // Performance: Optimize spawn logic for smoother gameplay
  const spawnCockroach = useCallback(() => {
    const aliveCount = cockroachesRef.current.filter(c => c.alive).length;
    if (aliveCount >= gameConstants.maxCockroaches) return;

    const size = Math.random() < 0.5 ? 80 : 50;
    const entrySide = Math.random();

    let startX = 0, startY = 0, speedX = 10, speedY = 10;

    if (entrySide < 0.33) {
      startX = Math.random() * (width - size);
      startY = -size;
      speedX = (Math.random() - 0.5) * 8; // More varied movement
      speedY = Math.random() * 10 + 6; // Faster vertical movement
    } else if (entrySide < 0.66) {
      startX = -size;
      startY = Math.random() * (height - 150);
      speedX = Math.random() * 10 + 6; // Faster horizontal movement
      speedY = (Math.random() - 0.5) * 8; // More varied movement
    } else {
      startX = width + size;
      startY = Math.random() * (height - 150);
      speedX = -(Math.random() * 10 + 6); // Faster horizontal movement
      speedY = (Math.random() - 0.5) * 8; // More varied movement
    }

    const newCockroach: Cockroach = {
      id: Date.now() + Math.random(),
      x: new Animated.Value(startX),
      y: new Animated.Value(startY),
      alive: true,
      opacity: new Animated.Value(1),
      speed: Math.random() * 80 + 30, // Faster overall movement
      size,
      speedX,
      speedY
    };

    cockroachesRef.current.push(newCockroach);
    
    // Performance: Only update score when needed
    setScore(prev => prev);
  }, [gameConstants.maxCockroaches, width, height]);

  // Performance: Ultra-smooth movement with 60 FPS
  const moveCockroaches = useCallback(() => {
    const shoeX = 170;
    const shoeYValue = (shoeY as any)._value + 320;

    cockroachesRef.current.forEach(c => {
      if (!c.alive) return;

      const currentX = (c.x as any)._value;
      const currentY = (c.y as any)._value;

      // Performance: Calculate distance only if needed
      const deltaX = shoeX - currentX;
      const deltaY = shoeYValue - currentY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > 0) {
        const randomFactor = Math.random() * 0.3 - 0.15; // Reduced randomness for smoother movement
        c.speedX = (deltaX / distance) * (Math.random() * 6 + 6) + randomFactor; // More consistent speed
        c.speedY = (deltaY / distance) * (Math.random() * 6 + 6) + randomFactor; // More consistent speed

        const newX = currentX + c.speedX;
        const newY = currentY + c.speedY;

        // Performance: Ultra-smooth animations with shorter duration
        Animated.parallel([
          Animated.timing(c.x, {
            toValue: newX,
            duration: 16, // 60 FPS for ultra-smooth movement
            useNativeDriver: true
          }),
          Animated.timing(c.y, {
            toValue: newY,
            duration: 16, // 60 FPS for ultra-smooth movement
            useNativeDriver: true
          })
        ]).start();
      }
    });
  }, [shoeY]);

  // Performance: Optimize accelerometer handling for responsive controls
  useEffect(() => {
    Accelerometer.setUpdateInterval(gameConstants.accelerometerInterval);
    const subscription = Accelerometer.addListener(accelData => {
      const deltaZ = Math.abs(accelData.z - lastZ);
      if (deltaZ > gameConstants.hitThreshold) {
        killCockroach();
      }
      setLastZ(accelData.z);
    });
    return () => subscription && subscription.remove();
  }, [lastZ, gameConstants.accelerometerInterval, gameConstants.hitThreshold]);

  // Performance: Optimize collision detection
  const isUnderHavaiana = useCallback((c: Cockroach) => {
    const shoeTop = (shoeY as any)._value;
    const shoeBottom = shoeTop + gameConstants.shoeDimensions.height;

    const cockLeft = (c.x as any)._value;
    const cockRight = cockLeft + c.size;
    const cockTop = (c.y as any)._value;
    const cockBottom = cockTop + c.size * 0.6;

    // Performance: Early exit for better collision detection
    if (cockRight < gameConstants.shoeDimensions.left) return false;
    if (cockLeft > gameConstants.shoeDimensions.right) return false;
    if (cockBottom < shoeTop) return false;
    if (cockTop > shoeBottom) return false;

    return true;
  }, [shoeY, gameConstants.shoeDimensions]);

  // Performance: Optimize kill logic with smoother animations
  const killCockroach = useCallback(() => {
    const idx = cockroachesRef.current.findIndex(c => c.alive && isUnderHavaiana(c));
    if (idx !== -1) {
      const c = cockroachesRef.current[idx];
      c.alive = false;
      
      // Performance: Smoother kill animations
      Animated.parallel([
        Animated.timing(c.opacity, { 
          toValue: 0, 
          duration: 300, // Faster fade for more responsive feel
          useNativeDriver: true 
        }),
        Animated.sequence([
          Animated.timing(shoeY, { 
            toValue: height - 350, 
            duration: 50, // Faster stomp animation
            useNativeDriver: true 
          }),
          Animated.timing(shoeY, { 
            toValue: height - 450, 
            duration: 50, // Faster stomp animation
            useNativeDriver: true 
          })
        ])
      ]).start();

      setScore(prev => prev + (c.size === 50 ? 2 : 1));
      playSquish();
    }
  }, [isUnderHavaiana, shoeY, height, playSquish]);

  // Performance: Optimize intervals for smoother gameplay
  useEffect(() => {
    const spawnInterval = setInterval(spawnCockroach, gameConstants.spawnInterval);
    return () => clearInterval(spawnInterval);
  }, [spawnCockroach, gameConstants.spawnInterval]);

  useEffect(() => {
    const moveInterval = setInterval(moveCockroaches, gameConstants.moveInterval);
    return () => clearInterval(moveInterval);
  }, [moveCockroaches, gameConstants.moveInterval]);

  // Performance: Memoize cockroach list to prevent unnecessary re-renders
  const cockroachList = useMemo(() => 
    cockroachesRef.current.map((c: Cockroach) => (
      <Image
        key={c.id}
        source={c.alive ? aliveImg : deadImg}
        style={[
          styles.cockroach,
          {
            left: (c.x as any)._value,
            top: (c.y as any)._value,
            opacity: (c.opacity as any)._value,
            width: c.size,
            height: c.size * 0.6
          }
        ]}
      />
    )), [cockroachesRef.current.length, score]);

  return (
    <ImageBackground source={tilesImg} style={styles.container}>
      <Text style={styles.score}>Puntuación: {score}</Text>
      {cockroachList}
      <Image
        source={havaianasImg}
        style={[
          styles.havaianas,
          { top: (shoeY as any)._value, left: 0, width: 340, height: 640 * 0.6 }
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