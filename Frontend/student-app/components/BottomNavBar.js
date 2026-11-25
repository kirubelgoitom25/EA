import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, View, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { haptic } from "../services/feedback";
import { tokens, ui } from "../theme";
import { CURVE, reduceMotionNow } from "./ui/motion";
import { NAV_BAR_HEIGHT } from "./ui/Screen";
import { pillMove, TAB_SWITCH } from "./ui/tabMotion";

// One icon family: outline when idle, filled when you're on it.
const ICONS = {
  home: ["home-outline", "home"],
  courses: ["book-outline", "book"],
  ranking: ["trophy-outline", "trophy"],
  profile: ["person-outline", "person"],
};

// The labels are for screen readers only — the bar itself is icons.
const TABS = [
  { key: "home", label: "Home" },
  { key: "courses", label: "Courses" },
  { key: "ranking", label: "Leaderboard" },
  { key: "profile", label: "Profile" },
];

const SIDE = 16;
const PILL_W = 72;
const PILL_H = 46;
const PILL_EDGE = 4;

// The bottom tab bar on every main screen: icons only. The active tab is a filled icon on a pale
// green pill with a 4 dp edge under it. Arriving from another tab, the pill slides over from that
// tab with the overshoot curve; pressing the active tab sinks the pill.
export default function BottomNavBar({ active, onNavigate }) {
  const insets = useSafeAreaInsets();
  const activeIndex = TABS.findIndex((tab) => tab.key === active);
  const [from] = useState(() => {
    const previous = TABS.findIndex((tab) => tab.key === pillMove(active));
    return previous >= 0 && !reduceMotionNow() ? previous : activeIndex;
  });
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width); // the bar spans the screen; onLayout corrects it
  const slide = useRef(new Animated.Value(from)).current; // tab index, fractional while moving
  const sink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!width || activeIndex < 0) return undefined;
    if (reduceMotionNow()) {
      slide.setValue(activeIndex);
      return undefined;
    }
    const run = Animated.timing(slide, { toValue: activeIndex, duration: TAB_SWITCH.pill, easing: CURVE.pop, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [width, activeIndex, slide]);

  const tabW = width ? (width - SIDE * 2) / TABS.length : 0;
  // built once per width: a rebuilt native-driver style reads a stale value
  const pillMotion = useMemo(
    () => ({
      transform: [
        { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [SIDE + (tabW - PILL_W) / 2, SIDE + (tabW - PILL_W) / 2 + tabW] }) },
      ],
    }),
    [slide, tabW],
  );

  const press = (down) => {
    if (reduceMotionNow()) return sink.setValue(down ? PILL_EDGE - 1 : 0);
    Animated.timing(sink, { toValue: down ? PILL_EDGE - 1 : 0, duration: 80, useNativeDriver: true }).start();
  };

  return (
    <View
      style={[styles.wrapper, { height: NAV_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width && activeIndex >= 0 ? (
        <Animated.View pointerEvents="none" style={[styles.pillBox, pillMotion]}>
          <View style={styles.pillLip} />
          <Animated.View style={[styles.pill, { transform: [{ translateY: sink }] }]} />
        </Animated.View>
      ) : null}

      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const [outline, filled] = ICONS[tab.key];

        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [styles.tab, pressed && !isActive && styles.pressed]}
            onPressIn={isActive ? () => press(true) : undefined}
            onPressOut={isActive ? () => press(false) : undefined}
            onPress={() => {
              haptic.light();
              onNavigate(tab.key);
            }}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <Animated.View style={[styles.icon, isActive && { transform: [{ translateY: sink }] }]}>
              <Ionicons name={isActive ? filled : outline} size={26} color={isActive ? ui.primary : tokens.text} />
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: tokens.surface,
    paddingHorizontal: SIDE,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: tokens.divider,
  },

  tab: {
    flex: 1,
    height: NAV_BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },

  pressed: {
    opacity: 0.6,
  },

  // centred in the tab like the icon: (NAV_BAR_HEIGHT - pill - edge) / 2 below the bar's top padding
  pillBox: {
    position: "absolute",
    left: 0,
    top: 6 + (NAV_BAR_HEIGHT - PILL_H - PILL_EDGE) / 2,
    width: PILL_W,
    height: PILL_H + PILL_EDGE,
  },

  pillLip: {
    position: "absolute",
    left: 0,
    right: 0,
    top: PILL_EDGE,
    bottom: 0,
    borderRadius: 14,
    backgroundColor: ui.pill.edge,
  },

  pill: {
    width: PILL_W,
    height: PILL_H,
    borderRadius: 14,
    backgroundColor: ui.pill.bg,
  },

  // the icon sits on the pill's face (the face is 4 dp above the box's centre)
  icon: {
    width: PILL_W,
    height: PILL_H,
    marginBottom: PILL_EDGE,
    alignItems: "center",
    justifyContent: "center",
  },
});
