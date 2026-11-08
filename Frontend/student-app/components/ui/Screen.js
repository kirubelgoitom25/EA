import React from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { layout, space, tokens } from "../../theme";
import DotGrid from "./DotGrid";
import { usePulse } from "./Skeleton";

// Height of <BottomNavBar> above the safe-area inset. Screens with a tab
// bar add this to their bottom padding so content scrolls clear of it.
export const NAV_BAR_HEIGHT = 64;
export const NAV_BAR_MARGIN = 0; // the bar sits flush with the screen bottom
export const TAB_BAR_HEIGHT = NAV_BAR_HEIGHT + NAV_BAR_MARGIN;

// Every EA screen sits in this: the brand background, safe-area spacing,
// the standard side gutter, and an optional pinned footer for the screen's
// one main action.
//
// - scroll: wrap content in a ScrollView (most screens)
// - footer: rendered pinned at the bottom, above the tab bar if there is one
// - withTabBar: leave room for <BottomNavBar>
// - grid: the neutral path-screen ground: stone background with the dot grid across the whole scroll
export default function Screen({
  children,
  scroll = true,
  footer,
  withTabBar = false,
  refreshControl,
  contentStyle,
  grid = false,
  background,
  pulsing = false, // refreshing: the content fades softly between 60% and 100% (still tappable)
}) {
  const pulse = usePulse(pulsing);
  const insets = useSafeAreaInsets();
  const bottomSpace = withTabBar ? TAB_BAR_HEIGHT + insets.bottom : insets.bottom;

  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: space.xxl + (footer ? 0 : bottomSpace) },
        grid && styles.fill, // the grid then covers at least the whole screen
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {grid ? <DotGrid /> : null}
      {/* only screens that refresh by pulling get the extra wrapper, so no other layout changes */}
      {refreshControl ? <Animated.View style={{ opacity: pulse }}>{children}</Animated.View> : children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }, background && { backgroundColor: background }]}>
      {content}
      {footer ? (
        <View
          style={[
            styles.footer,
            background && { backgroundColor: background },
            { paddingBottom: space.lg + bottomSpace },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.bg,
  },

  flex: {
    flex: 1,
  },

  fill: {
    flexGrow: 1,
  },

  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.lg,
  },

  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    backgroundColor: tokens.bg,
  },
});
