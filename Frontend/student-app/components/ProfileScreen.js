import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, SvgXml } from "react-native-svg";

import { isProActive, proLine } from "../services/access";
import { feedback, haptic, useFeedbackSettings } from "../services/feedback";
import { ProBadge } from "./ProScreen";
import { fonts, tokens, ui } from "../theme";
import BottomNavBar from "./BottomNavBar";
import Rise from "./session/Rise";
import AppText from "./ui/AppText";
import { useCountUp } from "./ui/anim";
import { initials } from "./rankingModel";
import { popTiming, useReducedMotion } from "./ui/motion";
import PressLip, { EdgeBox } from "./ui/PressLip";
import { PROFILE_ART } from "./ui/sceneryArt";
import Screen, { TAB_BAR_HEIGHT } from "./ui/Screen";
import StatusBarScrim, { scrimOnScroll } from "./ui/StatusBarScrim";
import { firstVisit, TabScene } from "./ui/tabMotion";
import Toggle from "./ui/Toggle";

const SIDE = 16;
const HEADER_BELOW_STATUS = 216; // the 260 panel of a 390 x 844 screen, less its 44 status bar
const BOTTOM_GAP = 16; // last element to the nav bar
const FLAT_BORDER = "#E3EAE5"; // flat (not tappable) white surfaces
const AVATAR = 104;
const STAT_DELAY = 200; // after the avatar starts its pop
const STAT_STEP = 100;
const RISE_AT = 500; // the rows and the settings card, after the stat cards
const RISE_STEP = 70;

// Profile: who you are, your numbers, and your settings. On a tall phone the header panel takes the
// extra height (the avatar, name and handle stay centred in it), so nothing leaves a gap above the
// nav bar.
export default function ProfileScreen({ user, pro, onLogout, onRequests, onPro, onFeelLab, onHome, onCourses, onRanking, onProfile }) {
  const proStatus = pro ?? user.pro;
  const { sound, haptics } = useFeedbackSettings();
  const xp = Number(user.xp) || 0;
  const streak = Math.max(Number(user.streak) || 0, 0);
  const weekly = Number(user.weeklyXp) || 0;

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [play] = useState(() => firstVisit("profile"));
  const [screenH, setScreenH] = useState(0);
  const [restH, setRestH] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const bottomPad = BOTTOM_GAP + TAB_BAR_HEIGHT + insets.bottom;
  const baseHeader = insets.top + HEADER_BELOW_STATUS;
  const headerH = screenH && restH ? Math.max(baseHeader, Math.floor(screenH - restH - bottomPad)) : baseHeader;

  return (
    <View style={styles.root} onLayout={(event) => setScreenH(event.nativeEvent.layout.height)}>
      <TabScene tab="profile">
        <Screen
          withTabBar
          underStatusBar
          background={ui.screen}
          contentStyle={[styles.content, { paddingBottom: bottomPad }]}
          scrollProps={{ scrollEventThrottle: 16, onScroll: scrimOnScroll(20, scrolled, setScrolled) }}
        >
          <View style={[styles.header, { height: headerH, paddingTop: insets.top }]}>
            <SvgXml
              xml={PROFILE_ART.xml}
              width={width}
              height={Math.round((PROFILE_ART.height * width) / PROFILE_ART.width)}
              style={styles.headerArt}
            />
            <View style={styles.identity}>
              <FoxAvatar name={user.name} play={play} />
              <AppText style={styles.name} numberOfLines={2}>
                {user.name}
              </AppText>
              {user.username || user.email ? (
                <AppText style={styles.handle} numberOfLines={1}>
                  {user.username ? `@${user.username}` : user.email}
                </AppText>
              ) : null}
              {isProActive(proStatus) ? (
                <View style={styles.proBadge}>
                  <ProBadge />
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.rest} onLayout={(event) => setRestH(Math.ceil(event.nativeEvent.layout.height))}>
            <View style={styles.stats}>
              <Stat order={0} play={play} value={streak} label="Day streak" colors={ui.streak} icon={<Flame />} />
              <Stat order={1} play={play} value={xp} label="Total XP" colors={ui.xp} icon={<Ionicons name="star" size={20} color={ui.xp.icon} />} />
              <Stat
                order={2}
                play={play}
                value={weekly}
                label="This week"
                colors={ui.trophy}
                icon={<Ionicons name="trending-up" size={20} color={ui.trophy.icon} />}
              />
            </View>

            <View style={styles.menu}>
              {onPro ? (
                <Rise order={0} distance={22} step={RISE_STEP} delay={RISE_AT} play={play}>
                  <MenuRow
                    onPress={onPro}
                    accessibilityLabel={`EA Pro. ${proLine(proStatus)}`}
                    icon="sparkles-outline"
                    colors={ui.trophy}
                    title="EA Pro"
                    subtitle={proLine(proStatus)}
                  />
                </Rise>
              ) : null}
              <Rise order={1} distance={22} step={RISE_STEP} delay={RISE_AT} play={play}>
                <MenuRow onPress={onRequests} accessibilityLabel="Payment requests" icon="receipt-outline" colors={ui.xp} title="Payment requests" />
              </Rise>
              {onFeelLab ? (
                <Rise order={1} distance={22} step={RISE_STEP} delay={RISE_AT} play={play}>
                  <MenuRow onPress={onFeelLab} accessibilityLabel="Feel lab" icon="pulse-outline" colors={ui.trophy} title="Feel lab" subtitle="Try haptic feelings" />
                </Rise>
              ) : null}
            </View>

            <Rise order={2} distance={22} step={RISE_STEP} delay={RISE_AT} play={play}>
              <AppText style={styles.eyebrow}>SETTINGS</AppText>
              <View style={styles.settings}>
                <SettingRow
                  label="Sound effects"
                  value={sound}
                  onChange={(value) => {
                    feedback.setSoundEnabled(value);
                    if (value) feedback.button();
                    else haptic.light();
                  }}
                />
                <View style={styles.separator} />
                <SettingRow
                  label="Haptics"
                  value={haptics}
                  onChange={(value) => {
                    feedback.setHapticsEnabled(value);
                    if (value) feedback.button();
                  }}
                />
              </View>
            </Rise>

            <Rise order={3} distance={22} step={RISE_STEP} delay={RISE_AT} play={play}>
              <AppText style={styles.note}>Your teacher can see when you're online and which chapter you have open.</AppText>
              <PressLip
                onPress={onLogout}
                accessibilityLabel="Log out"
                lip={ui.wrongSheet.border}
                lipSize={4}
                radius={16}
                border
                haptics
                style={styles.logout}
                faceStyle={styles.logoutFace}
              >
                <AppText style={styles.logoutLabel}>Log out</AppText>
              </PressLip>
            </Rise>
          </View>
        </Screen>
        <StatusBarScrim visible={scrolled} color={ui.screen} />
      </TabScene>

      <BottomNavBar
        active="profile"
        onNavigate={(tab) => {
          if (tab === "home") onHome();
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
          if (tab === "profile") onProfile();
        }}
      />
    </View>
  );
}

// A flat tinted tile (not tappable): icon and number, the label under it. Pops in, then counts up.
function Stat({ value, label, icon, colors, order, play }) {
  const reduce = useReducedMotion();
  const still = reduce || !play;
  const shown = useCountUp(value, 800, play);
  const pop = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) return undefined;
    const run = popTiming(pop, { delay: STAT_DELAY + order * STAT_STEP });
    run.start();
    return () => run.stop();
  }, [still, order, pop]);
  const motion = useMemo(
    () => ({
      opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
      transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
    }),
    [pop],
  );
  return (
    <Animated.View style={[styles.stat, { backgroundColor: colors.bg }, motion]} accessible accessibilityLabel={`${value} ${label}`}>
      <View style={styles.statValueRow}>
        {icon}
        <AppText style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
          {shown}
        </AppText>
      </View>
      <AppText style={[styles.statLabel, { color: colors.ink }]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </AppText>
    </Animated.View>
  );
}

// A white card that sinks when tapped: tinted icon tile, title (and a line under it), chevron.
function MenuRow({ onPress, accessibilityLabel, icon, colors, title, subtitle }) {
  return (
    <PressLip
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      lip={ui.surfaceEdge}
      lipSize={4}
      radius={16}
      border
      haptics
      faceStyle={styles.menuFace}
    >
      <EdgeBox lip={colors.edge} lipSize={3} radius={12} faceStyle={[styles.menuIcon, { backgroundColor: colors.bg }]}>
        <Ionicons name={icon} size={20} color={colors.icon} />
      </EdgeBox>
      <View style={styles.menuText}>
        <AppText style={styles.menuTitle} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText style={styles.menuSubtitle} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={ui.textMuted} />
    </PressLip>
  );
}

function SettingRow({ label, value, onChange }) {
  return (
    <View style={styles.setting}>
      <AppText style={styles.settingLabel}>{label}</AppText>
      <Toggle value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

// The profile photo for now: the fox-head shape (pointed ears, tapered chin) with the student's
// initials, a 4 dp white outline. Pops in (0.5 to 1, overshoot, 500 ms) the first time.
function FoxAvatar({ name, play }) {
  const reduce = useReducedMotion();
  const still = reduce || !play;
  const pop = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) return undefined;
    const run = popTiming(pop, { duration: 500 });
    run.start();
    return () => run.stop();
  }, [still, pop]);
  const motion = useMemo(
    () => ({
      opacity: pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
      transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
    }),
    [pop],
  );
  return (
    <Animated.View style={[styles.avatar, motion]} accessible accessibilityLabel={`Avatar, ${name}`}>
      <Svg width={AVATAR} height={AVATAR} viewBox="0 0 100 100">
        <Path
          d="M13 11 L37 29 Q50 25 63 29 L87 11 L90 52 Q90 84 50 91 Q10 84 10 52 Z"
          fill="#D9ECE0"
          stroke="#FFFFFF"
          strokeWidth={(4 * 100) / AVATAR}
          strokeLinejoin="round"
        />
      </Svg>
      <AppText style={styles.avatarText}>{initials(name)}</AppText>
    </Animated.View>
  );
}

// The streak flame (the shape the profile has always used), in the streak colour.
function Flame() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4-1-6 1-9.5z" fill={ui.streak.icon} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.screen, // what shows while one tab fades into another
  },

  content: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },

  // header
  header: {
    backgroundColor: ui.sky,
    overflow: "hidden",
    justifyContent: "center",
    paddingBottom: 6, // the avatar sits 22 below the status bar on a 390 x 844 screen
  },

  headerArt: {
    position: "absolute",
    left: 0,
    bottom: 0,
  },

  identity: {
    alignItems: "center",
    paddingHorizontal: 24,
  },

  avatar: {
    width: AVATAR,
    height: AVATAR,
    alignItems: "center",
  },

  avatarText: {
    position: "absolute",
    top: AVATAR * 0.36,
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 38,
    color: ui.done.ink,
  },

  name: {
    marginTop: 10,
    textAlign: "center",
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: ui.ink,
  },

  handle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: ui.textSecondary,
  },

  proBadge: {
    marginTop: 6,
  },

  rest: {
    paddingHorizontal: SIDE,
  },

  // stats
  stats: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  stat: {
    flex: 1,
    height: 66,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statValue: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 30,
    color: ui.ink,
  },

  // the full tile width: measured to its own width, Android wrapped "This week" and showed only "This"
  statLabel: {
    alignSelf: "stretch",
    textAlign: "center",
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
  },

  // menu rows
  menu: {
    marginTop: 16,
    gap: 10,
  },

  menuFace: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    backgroundColor: ui.surface,
  },

  menuIcon: {
    width: 40,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
  },

  menuText: {
    flex: 1,
  },

  menuTitle: {
    fontFamily: fonts.display,
    fontSize: 15,
    lineHeight: 20,
    color: ui.ink,
  },

  menuSubtitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: ui.textMuted,
  },

  // settings
  eyebrow: {
    marginTop: 18,
    marginHorizontal: 4,
    fontFamily: fonts.display,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    color: ui.primary,
  },

  settings: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: FLAT_BORDER,
    backgroundColor: ui.surface,
    overflow: "hidden",
  },

  setting: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },

  separator: {
    height: 2,
    backgroundColor: "#E6ECE8",
  },

  settingLabel: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: ui.ink,
  },

  note: {
    marginTop: 12,
    marginHorizontal: 4,
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 17,
    color: ui.textMuted,
  },

  // log out
  logout: {
    marginTop: 16,
  },

  logoutFace: {
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ui.surface,
  },

  logoutLabel: {
    fontFamily: fonts.display,
    fontSize: 15,
    lineHeight: 20,
    color: tokens.wrongText,
  },
});
