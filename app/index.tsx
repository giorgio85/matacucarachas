import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ImageBackground, Image, StyleSheet, Dimensions, Animated, TouchableWithoutFeedback } from 'react-native';
import { Accelerometer } from 'expo-sensors';
// Note: expo-av is deprecated but still functional. Will update when a stable replacement is available.
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
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
  timeCreated: number;
};

export default function App() {
  const cockroachesRef = useRef<Cockroach[]>([]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lastZ, setLastZ] = useState(0);
  const [shoeY] = useState(new Animated.Value(height - 550));
  const [gameTime, setGameTime] = useState(0); // Track game time for difficulty scaling
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [isLevelUp, setIsLevelUp] = useState(false);
  const [levelUpAnimation] = useState(new Animated.Value(1));
  const [showInfoModal, setShowInfoModal] = useState(false);
  
  // Performance: Memoize constants for smoother gameplay
  const gameConstants = useMemo(() => ({
    maxCockroaches: 12, // Reduced to prevent performance issues
    maxDeadCockroaches: 8, // Limit dead cockroaches on screen
    spawnInterval: 600, // Slightly slower spawning for better performance
    moveInterval: 16, // 60 FPS movement for smooth animation
    accelerometerInterval: 16, // 60 FPS accelerometer for responsive controls
    hitThreshold: 1.2, // Slightly more sensitive for better feel
    cleanupInterval: 2000, // Clean up dead cockroaches every 2 seconds
    gameTimeInterval: 1000, // Update game time every second
    shoeDimensions: {
      left: 0,
      right: 340,
      height: 640 * 0.6
    }
  }), []);

  // Performance: Calculate dynamic speed based on game time
  const getDynamicSpeed = useCallback((baseSpeed: number) => {
    const timeMultiplier = Math.min(1 + (gameTime / 30), 3); // Max 3x speed after 30 seconds
    return baseSpeed * timeMultiplier;
  }, [gameTime]);

  // Performance: Calculate dynamic spawn interval based on game time
  const getDynamicSpawnInterval = useCallback(() => {
    const baseInterval = gameConstants.spawnInterval;
    const timeMultiplier = Math.max(0.3, 1 - (gameTime / 60)); // Min 0.3x interval after 60 seconds
    return baseInterval * timeMultiplier;
  }, [gameTime, gameConstants.spawnInterval]);

  // Performance: Memoize the playSquish function
  const playSquish = useCallback(async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(squishSound);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && !status.isPlaying) sound.unloadAsync();
      });
    } catch (error) {
      console.log('Audio error:', error);
    }
  }, []);

  // Performance: Clean up dead cockroaches to prevent memory issues
  const cleanupDeadCockroaches = useCallback(() => {
    const now = Date.now();
    const maxAge = 5000; // Remove dead cockroaches after 5 seconds
    
    cockroachesRef.current = cockroachesRef.current.filter(c => {
      if (!c.alive && (now - c.timeCreated) > maxAge) {
        // Clean up Animated.Value to prevent memory leaks
        c.x.stopAnimation();
        c.y.stopAnimation();
        c.opacity.stopAnimation();
        return false;
      }
      return true;
    });
  }, []);

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

  // Performance: Optimize kill logic
  const killCockroach = useCallback((cockroach: Cockroach) => {
    if (!cockroach.alive) return;

    cockroach.alive = false;
    setScore(prev => prev + (cockroach.size === 50 ? 2 : 1)); // Bigger cockroaches give more points

    // Play sound and animate death
    playSquish();

    // Animate the death
    Animated.parallel([
      Animated.timing(cockroach.opacity, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(cockroach.y, {
        toValue: (cockroach.y as any)._value + 20,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();
  }, [playSquish]);

  // Performance: Optimize spawn logic for smoother gameplay with dynamic difficulty
  const spawnCockroach = useCallback(() => {
    const aliveCount = cockroachesRef.current.filter(c => c.alive).length;
    const deadCount = cockroachesRef.current.filter(c => !c.alive).length;
    
    // Don't spawn if we have too many alive or too many dead
    if (aliveCount >= gameConstants.maxCockroaches || deadCount >= gameConstants.maxDeadCockroaches) {
      return;
    }

    const size = Math.random() < 0.5 ? 80 : 50;
    const entrySide = Math.random();

    let startX = 0, startY = 0, speedX = 10, speedY = 10;

    // Base speeds that will be modified by dynamic difficulty
    const baseSpeedX = Math.random() * 6 + 4; // 4-10 base speed
    const baseSpeedY = Math.random() * 6 + 4; // 4-10 base speed

    if (entrySide < 0.33) {
      startX = Math.random() * (width - size);
      startY = -size;
      speedX = (Math.random() - 0.5) * baseSpeedX;
      speedY = baseSpeedY + Math.random() * 2; // Always move down
    } else if (entrySide < 0.66) {
      startX = -size;
      startY = Math.random() * (height - 150);
      speedX = baseSpeedX + Math.random() * 2; // Always move right
      speedY = (Math.random() - 0.5) * baseSpeedY;
    } else {
      startX = width + size;
      startY = Math.random() * (height - 150);
      speedX = -(baseSpeedX + Math.random() * 2); // Always move left
      speedY = (Math.random() - 0.5) * baseSpeedY;
    }

    const newCockroach: Cockroach = {
      id: Date.now() + Math.random(),
      x: new Animated.Value(startX),
      y: new Animated.Value(startY),
      alive: true,
      opacity: new Animated.Value(1),
      speed: Math.random() * 40 + 20, // Base speed that will be modified
      size,
      speedX,
      speedY,
      timeCreated: Date.now()
    };

    cockroachesRef.current.push(newCockroach);
  }, [gameConstants.maxCockroaches, gameConstants.maxDeadCockroaches, width, height]);

  // Performance: Ultra-smooth movement with 60 FPS and dynamic speed
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
        // Apply dynamic speed scaling
        const dynamicSpeedMultiplier = getDynamicSpeed(1);
        
        const randomFactor = Math.random() * 0.3 - 0.15; // Reduced randomness for smoother movement
        c.speedX = (deltaX / distance) * (Math.random() * 4 + 4) * dynamicSpeedMultiplier + randomFactor;
        c.speedY = (deltaY / distance) * (Math.random() * 4 + 4) * dynamicSpeedMultiplier + randomFactor;

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
  }, [shoeY, getDynamicSpeed]);

  // Performance: Optimize accelerometer handling for responsive controls
  useEffect(() => {
    Accelerometer.setUpdateInterval(gameConstants.accelerometerInterval);
    const subscription = Accelerometer.addListener(accelData => {
      const deltaZ = Math.abs(accelData.z - lastZ);
      if (deltaZ > gameConstants.hitThreshold) {
        // Find and kill the cockroach under the shoe
        const cockroachToKill = cockroachesRef.current.find(c => c.alive && isUnderHavaiana(c));
        if (cockroachToKill) {
          killCockroach(cockroachToKill);
          
          // Add haptic feedback for stomping
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          
          // Add satisfying shoe stomp animation
          Animated.sequence([
            Animated.timing(shoeY, { 
              toValue: height - 350, 
              duration: 50, // Fast stomp down
              useNativeDriver: true 
            }),
            Animated.timing(shoeY, { 
              toValue: height - 450, 
              duration: 50, // Fast stomp back up
              useNativeDriver: true 
            })
          ]).start();
        }
      }
      setLastZ(accelData.z);
    });
    return () => subscription && subscription.remove();
  }, [lastZ, gameConstants.accelerometerInterval, gameConstants.hitThreshold, isUnderHavaiana, killCockroach, shoeY, height]);

  // Performance: Update game time for difficulty scaling
  useEffect(() => {
    const gameTimeInterval = setInterval(() => {
      setGameTime(prev => prev + 1);
    }, gameConstants.gameTimeInterval);
    return () => clearInterval(gameTimeInterval);
  }, [gameConstants.gameTimeInterval]);

  // Performance: Optimize intervals for smoother gameplay with dynamic difficulty
  useEffect(() => {
    const dynamicSpawnInterval = getDynamicSpawnInterval();
    const spawnInterval = setInterval(spawnCockroach, dynamicSpawnInterval);
    return () => clearInterval(spawnInterval);
  }, [spawnCockroach, getDynamicSpawnInterval]);

  useEffect(() => {
    const moveInterval = setInterval(moveCockroaches, gameConstants.moveInterval);
    return () => clearInterval(moveInterval);
  }, [moveCockroaches, gameConstants.moveInterval]);

  // Performance: Clean up dead cockroaches periodically
  useEffect(() => {
    const cleanupInterval = setInterval(cleanupDeadCockroaches, gameConstants.cleanupInterval);
    return () => clearInterval(cleanupInterval);
  }, [cleanupDeadCockroaches, gameConstants.cleanupInterval]);

  // Game configuration
  const gameConfig = useMemo(() => ({
    pointsPerLevel: 20, // Points needed to level up
    maxLevel: 50, // Maximum level cap
    levelUpCelebrationDuration: 3000, // How long to show level up celebration
  }), []);

  // Calculate level based on score
  const calculateLevel = useCallback((currentScore: number) => {
    return Math.min(Math.floor(currentScore / gameConfig.pointsPerLevel) + 1, gameConfig.maxLevel);
  }, [gameConfig.pointsPerLevel, gameConfig.maxLevel]);

  // Calculate progress to next level
  const getLevelProgress = useCallback((currentScore: number, currentLevel: number) => {
    const pointsInCurrentLevel = currentScore % gameConfig.pointsPerLevel;
    return pointsInCurrentLevel / gameConfig.pointsPerLevel;
  }, [gameConfig.pointsPerLevel]);

  // Check for level up
  useEffect(() => {
    const newLevel = calculateLevel(score);
    if (newLevel > level && newLevel <= gameConfig.maxLevel) {
      setLevel(newLevel);
      setIsLevelUp(true);
      
      // Level up celebration animation
      Animated.sequence([
        Animated.timing(levelUpAnimation, {
          toValue: 1.2,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(levelUpAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Reset level up indicator after celebration
      setTimeout(() => setIsLevelUp(false), gameConfig.levelUpCelebrationDuration);
    }
  }, [score, level, calculateLevel, gameConfig.maxLevel, gameConfig.levelUpCelebrationDuration, levelUpAnimation]);

  // Load best score from storage on app start
  useEffect(() => {
    const loadBestScore = async () => {
      try {
        const savedBestScore = await AsyncStorage.getItem('bestScore');
        if (savedBestScore) {
          setBestScore(parseInt(savedBestScore, 10));
        }
      } catch (error) {
        console.log('Error loading best score:', error);
      }
    };
    loadBestScore();
  }, []);

  // Save best score when it's updated
  useEffect(() => {
    const saveBestScore = async () => {
      try {
        await AsyncStorage.setItem('bestScore', bestScore.toString());
      } catch (error) {
        console.log('Error saving best score:', error);
      }
    };
    if (bestScore > 0) {
      saveBestScore();
    }
  }, [bestScore]);

  // Update best score when current score exceeds it
  useEffect(() => {
    if (score > bestScore && score > 0) {
      setBestScore(score);
      setIsNewRecord(true);
      // Reset the new record indicator after 3 seconds
      setTimeout(() => setIsNewRecord(false), 3000);
    }
  }, [score, bestScore]);

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
            height: c.size * 0.6,
            // Add subtle glow for alive cockroaches to indicate they're tappable
            ...(c.alive && {
              shadowColor: '#FFD700',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.3,
              shadowRadius: 3,
            })
          }
        ]}
      />
    )), [cockroachesRef.current.length, score]);

  return (
    <TouchableWithoutFeedback
      onPress={() => {
        // Trigger havaianas stomp action on screen tap
        const cockroachToKill = cockroachesRef.current.find(c => c.alive && isUnderHavaiana(c));
        if (cockroachToKill) {
          killCockroach(cockroachToKill);
          
          // Add haptic feedback for stomping
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          
          // Add satisfying shoe stomp animation
          Animated.sequence([
            Animated.timing(shoeY, { 
              toValue: height - 350, 
              duration: 50, // Fast stomp down
              useNativeDriver: true 
            }),
            Animated.timing(shoeY, { 
              toValue: height - 450, 
              duration: 50, // Fast stomp back up
              useNativeDriver: true 
            })
          ]).start();
        } else {
          // Even if no cockroach is under the shoe, still do the stomp animation
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Animated.sequence([
            Animated.timing(shoeY, { 
              toValue: height - 350, 
              duration: 50,
              useNativeDriver: true 
            }),
            Animated.timing(shoeY, { 
              toValue: height - 450, 
              duration: 50,
              useNativeDriver: true 
            })
          ]).start();
        }
      }}
    >
      <ImageBackground source={tilesImg} style={styles.container}>
        {/* Enhanced Top Bar */}
        <View style={styles.topBar}>
          {/* Info Button */}
          <TouchableWithoutFeedback onPress={() => setShowInfoModal(true)}>
            <View style={styles.infoButton}>
              <Text style={styles.infoButtonText}>ℹ️</Text>
            </View>
          </TouchableWithoutFeedback>

          {/* Score and Level Row */}
          <View style={styles.topRow}>
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreLabel}>SCORE</Text>
              <Text style={styles.scoreValue}>{score}</Text>
            </View>
            
            <View style={styles.levelContainer}>
              <Text style={styles.levelLabel}>LEVEL</Text>
              <Animated.Text 
                style={[
                  styles.levelValue,
                  { transform: [{ scale: levelUpAnimation }] }
                ]}
              >
                {level}
                {isLevelUp && ' 🎉'}
              </Animated.Text>
            </View>
            
            <View style={styles.bestContainer}>
              <Text style={styles.bestLabel}>BEST</Text>
              <Text style={[
                styles.bestValue,
                isNewRecord && styles.newRecord
              ]}>
                {bestScore}
                {isNewRecord && ' 🏆'}
              </Text>
            </View>
          </View>

          {/* Progress Bar Row */}
          <View style={styles.progressRow}>
            <View style={styles.progressContainer}>
              <Text style={styles.progressLabel}>
                Next level: {score % gameConfig.pointsPerLevel}/{gameConfig.pointsPerLevel}
              </Text>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${getLevelProgress(score, level) * 100}%` }
                  ]} 
                />
              </View>
            </View>
          </View>

          {/* Speed Row */}
          <View style={styles.speedRow}>
            <Text style={styles.speedLabel}>SPEED</Text>
            <Text style={styles.speedValue}>{Math.round(getDynamicSpeed(1) * 100)}%</Text>
          </View>

          {/* Instructions Row */}
          <View style={styles.instructionsRow}>
            <Text style={styles.instructionsText}>
              💡 Tap anywhere on screen or shake phone to stomp with havaianas
            </Text>
          </View>
        </View>

        {cockroachList}
        <Image
          source={havaianasImg}
          style={[
            styles.havaianas,
            { top: (shoeY as any)._value, left: 0, width: 340, height: 640 * 0.6 }
          ]}
        />

        {/* Info Modal */}
        {showInfoModal && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🐜 How to Play 🐜</Text>
                <TouchableWithoutFeedback onPress={() => setShowInfoModal(false)}>
                  <View style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </View>
                </TouchableWithoutFeedback>
              </View>
              
              <View style={styles.modalBody}>
                <Text style={styles.instructionText}>
                  🎯 <Text style={styles.boldText}>Objective:</Text> Squash those pesky cockroaches before they take over your house!
                </Text>
                
                <Text style={styles.instructionText}>
                  🥾 <Text style={styles.boldText}>Controls:</Text>
                </Text>
                <Text style={styles.subText}>• Tap anywhere on screen to stomp with your havaianas</Text>
                <Text style={styles.subText}>• Or shake your phone like you're really mad at bugs!</Text>
                
                <Text style={[styles.instructionText, { marginTop: 20 }]}>
                  🐛 <Text style={styles.boldText}>Gameplay:</Text>
                </Text>
                <Text style={styles.subText}>• Big cockroaches = 2 points (they're harder to miss!)</Text>
                <Text style={styles.subText}>• Small cockroaches = 1 point (but they're sneaky!)</Text>
                <Text style={styles.subText}>• Level up every 20 points</Text>
                <Text style={styles.subText}>• Game gets faster and more intense as you progress</Text>
                
                <Text style={[styles.instructionText, { marginTop: 20 }]}>
                  💡 <Text style={styles.boldText}>Pro Tips:</Text>
                </Text>
                <Text style={styles.subText}>• Watch out for the golden glow - it means they're alive!</Text>
                <Text style={styles.subText}>• Don't let them reach your havaianas!</Text>
                <Text style={styles.subText}>• The more you stomp, the more they'll come!</Text>
                
                <Text style={styles.funnyText}>
                  🎉 Remember: In this game, being a bug squasher is totally cool! 🎉
                </Text>
              </View>
            </View>
          </View>
        )}
      </ImageBackground>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    paddingTop: 15 
  },
  topBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    margin: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  scoreContainer: {
    alignItems: 'center',
    flex: 1,
  },
  levelContainer: {
    alignItems: 'center',
    flex: 1,
  },
  bestContainer: {
    alignItems: 'center',
    flex: 1,
  },
  scoreLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  levelLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  bestLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  scoreValue: {
    fontSize: 20,
    color: '#2E7D32',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  levelValue: {
    fontSize: 20,
    color: '#1976D2',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  bestValue: {
    fontSize: 20,
    color: '#FF8F00',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  newRecord: {
    color: '#FFD700',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  progressRow: {
    marginBottom: 10,
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 5,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  speedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  speedLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  speedValue: {
    fontSize: 16,
    color: '#D32F2F',
    fontWeight: 'bold',
  },
  cockroach: { position: 'absolute' },
  havaianas: { position: 'absolute', zIndex: 10 },
  instructionsRow: {
    marginTop: 10,
    alignItems: 'center',
  },
  instructionsText: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  infoButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  infoButtonText: {
    fontSize: 20,
    color: '#333',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    width: '80%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  modalBody: {
    marginBottom: 20,
  },
  instructionText: {
    fontSize: 16,
    color: '#555',
    marginBottom: 10,
    lineHeight: 22,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#333',
  },
  subText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 15,
    lineHeight: 20,
  },
  funnyText: {
    fontSize: 18,
    color: '#FF4136',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 15,
  },
}); 