import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Polygon, Rect, Stop as GradientStop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { layout, space, TAIL, tailAt, tokens } from "../theme";
import AppText from "./ui/AppText";
import { Entrance } from "./ui/anim";
import Emblem from "./ui/Emblem";
import EmberButton from "./ui/EmberButton";
import Fox from "./ui/Fox";
import { useReducedMotion } from "./ui/motion";
import { worldFor } from "./ui/worlds";

const STAGE = 372;
const MEDALLION = 176;

// A full-screen moment on a course's journey: the introduction when a course is first opened, and the
// finale when its last chapter is done. The course's own emblem is the medallion, rays turn behind it,
// the fox stands next to it, and one ember button moves on. The finale also showers confetti.
//
// - overline / title / body: the words
// - chapters / done: the route preview (done chapters in the Tail, the den at the end)
// - celebrate: the finale: full ring and seal on the medallion, turning rays, confetti
// - buttonLabel / onPress: the one action; onBack adds a back arrow
export default function JourneyMoment({
  course,
  overline,
  title,
  body,
  chapters = 0,
  done = 0,
  caption,
  celebrate = false,
  buttonLabel,
  onPress,
  onBack,
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const world = worldFor(course?.id);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={[styles.stage, { height: STAGE + insets.top, paddingTop: insets.top }]}>
          <Rays color={world.tint} spin={celebrate} width={width} />
          {/* the rays melt into the page at the bottom and at the top */}
          <LinearGradient colors={[`${tokens.bg}00`, tokens.bg]} style={styles.fadeBottom} pointerEvents="none" />
          <LinearGradient colors={[tokens.bg, `${tokens.bg}00`]} style={styles.fadeTop} pointerEvents="none" />
          <Entrance delay={80} distance={20} style={styles.medallion}>
            <Emblem course={course} size={MEDALLION} progress={celebrate ? 1 : 0} />
          </Entrance>
          <Entrance delay={260} distance={36} style={[styles.fox, { left: width / 2 + 24, bottom: 8 }]}>
            <Fox mood={celebrate ? "proud" : "greeting"} size={176} />
          </Entrance>
          {celebrate ? <Confetti world={world} width={width} /> : null}
        </View>

        <View style={styles.copy}>
          <Entrance delay={300} distance={14}>
            <AppText variant="overline" tone="accent" style={styles.center}>
              {overline}
            </AppText>
            <AppText variant="display" style={[styles.center, styles.title]} accessibilityRole="header">
              {title}
            </AppText>
          </Entrance>
          {body ? (
            <Entrance delay={420} distance={14}>
              <AppText tone="secondary" style={[styles.center, styles.body]} numberOfLines={4}>
                {body}
              </AppText>
            </Entrance>
          ) : null}
          {chapters > 0 ? (
            <Entrance delay={540} distance={14} style={styles.route}>
              <RoutePreview chapters={chapters} done={done} />
              <AppText variant="label" tone="secondary" style={styles.center}>
                {caption}
              </AppText>
            </Entrance>
          ) : null}
        </View>
      </ScrollView>

      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={space.sm}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.back, { top: insets.top + space.sm }, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={tokens.text} />
        </Pressable>
      ) : null}

      <View style={[styles.footer, { paddingBottom: space.lg + insets.bottom }]}>
        <Entrance delay={680} distance={30}>
          <EmberButton label={buttonLabel} onPress={onPress} />
        </Entrance>
      </View>
    </View>
  );
}

// Light rays fanning out from behind the medallion; in the finale they turn, slowly.
function Rays({ color, spin, width }) {
  const reduce = useReducedMotion();
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spin || reduce) return undefined;
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 60000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin, reduce, turn]);

  const size = Math.max(width, 360) * 1.25;
  const wedges = useMemo(() => {
    const r = size / 2;
    return Array.from({ length: 12 }, (_, i) => {
      const a1 = (i * 2 * Math.PI) / 12;
      const a2 = a1 + Math.PI / 12;
      const pt = (a) => `${(r + r * Math.cos(a)).toFixed(1)},${(r + r * Math.sin(a)).toFixed(1)}`;
      return <Polygon key={i} points={`${r},${r} ${pt(a1)} ${pt(a2)}`} fill={color} opacity={0.16} />;
    });
  }, [color, size]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.rays,
        { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 },
        { transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] },
      ]}
    >
      <Svg width={size} height={size}>{wedges}</Svg>
    </Animated.View>
  );
}

// A shower of confetti, once, in the tail's colours and the world's. Nothing when motion is reduced.
function Confetti({ world, width }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        x: ((i * 37) % 100) / 100,
        delay: (i % 7) * 140,
        drift: ((i % 5) - 2) * 14,
        size: 7 + (i % 3) * 3,
        round: i % 2 === 0,
        color: [tailAt(0), tailAt(0.5), tailAt(1), world.tint, world.bg][i % 5],
        value: new Animated.Value(0),
      })),
    [world],
  );
  useEffect(() => {
    if (reduce) return undefined;
    const runs = pieces.map((p) =>
      Animated.timing(p.value, { toValue: 1, duration: 2600 + (p.delay % 5) * 200, delay: p.delay, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    );
    const all = Animated.parallel(runs);
    all.start();
    return () => all.stop();
  }, [pieces, reduce]);
  if (reduce) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: p.x * (width - 20) + 10,
            top: -20,
            width: p.size,
            height: p.round ? p.size : p.size * 1.8,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: p.color,
            opacity: p.value.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: p.value.interpolate({ inputRange: [0, 1], outputRange: [0, STAGE + 40] }) },
              { translateX: p.value.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.value.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.drift * 12}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

// The path in miniature: one tile per chapter (at most 8) on a thin connector, ending at the den.
function RoutePreview({ chapters, done }) {
  const { width: screenWidth } = useWindowDimensions();
  const width = screenWidth - layout.gutter * 2;
  const dots = Math.min(chapters, 8);
  const reached = done >= chapters;
  const filled = reached ? dots : Math.floor((done / chapters) * dots);
  // tiles and the den, spread across the width
  const xs = Array.from({ length: dots + 1 }, (_, i) => 14 + (i * (width - 44)) / dots);
  const y = 26;
  const den = xs[dots];
  return (
    <View accessible accessibilityLabel={`${done} of ${chapters} ${chapters === 1 ? "chapter" : "chapters"} done, then the den`}>
      <Svg width={width} height={52}>
        <Defs>
          <SvgGradient id="mini" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2="0">
            <GradientStop offset="0" stopColor={TAIL[0]} />
            <GradientStop offset="0.5" stopColor={TAIL[1]} />
            <GradientStop offset="1" stopColor={TAIL[2]} />
          </SvgGradient>
        </Defs>
        <Path d={`M${xs[0]} ${y} H${den}`} stroke="#E6E2EC" strokeWidth={6} strokeLinecap="round" />
        {filled > 0 ? <Path d={`M${xs[0]} ${y} H${reached ? den : xs[Math.max(filled - 1, 0)]}`} stroke="url(#mini)" strokeWidth={6} strokeLinecap="round" /> : null}
        {xs.slice(0, dots).map((x, i) => (
          <Rect key={i} x={x - 10} y={y - 10} width={20} height={20} rx={7} fill={i < filled ? tailAt(i / dots) : "#F1EFF3"} stroke={i < filled ? tokens.surface : "#E2DEE8"} strokeWidth={2} />
        ))}
        {/* the den */}
        <Path
          d={`M${den - 13} ${y + 14} V${y} A13 13 0 0 1 ${den + 13} ${y} V${y + 14} Z`}
          fill={reached ? tokens.plum : tokens.surface}
          stroke={reached ? tokens.plum : "#D9D2DE"}
          strokeWidth={2}
          strokeDasharray={reached ? undefined : "4 3"}
        />
        <Path d={`M${den - 4.5} ${y + 14} V${y + 8} A4.5 4.5 0 0 1 ${den + 4.5} ${y + 8} V${y + 14} Z`} fill={reached ? tokens.accent : "#E2DCE7"} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  stage: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  medallion: { alignItems: "center", justifyContent: "center" },
  fox: { position: "absolute" },
  rays: { position: "absolute", left: "50%", top: "50%" },
  fadeBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: 150 },
  fadeTop: { position: "absolute", left: 0, right: 0, top: 0, height: 90 },
  copy: { paddingHorizontal: layout.gutter, marginTop: space.md, gap: space.sm },
  center: { textAlign: "center" },
  title: { marginTop: space.xs },
  body: { marginTop: space.xs },
  route: { marginTop: space.xl, gap: space.md },
  back: {
    position: "absolute",
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: layout.gutter, paddingTop: space.md },
});
