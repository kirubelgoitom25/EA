// ProfileScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { haptic } from "../services/feedback";
import { radius, useTheme } from "../theme";
import BottomNavBar from "./BottomNavBar";
import XpProgressRing from "./XpProgressRing";
import DuoButton from "./DuoButton";
import FeedbackSettings from "../components/FeedbackSettings";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Same interaction language as HomeScreen: cards 0.97, buttons 0.96
const PRESS_SCALE_BUTTON = 0.96;
const SMALL_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const SECTION_COUNT = 8; // header, identity, stats, appearance, feedback, coach, account, logout

const getInitials = (name) => {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

const riseInStyle = (value, distance = 10) => ({
  opacity: value,
  transform: [
    {
      translateY: value.interpolate({
        inputRange: [0, 1],
        outputRange: [distance, 0],
      }),
    },
  ],
});

/** Press feedback wrapper (same helper as HomeScreen). */
function ScalePressable({
  children,
  onPress,
  style,
  wrapperStyle,
  scaleTo = 0.97,
  dimTo = 0.94,
  hitSlop,
  accessibilityLabel,
  accessibilityState,
}) {
  const pressed = useRef(new Animated.Value(0)).current;

  useEffect(() => () => pressed.stopAnimation(), [pressed]);

  const handlePressIn = () => {
    pressed.stopAnimation();
    Animated.timing(pressed, {
      toValue: 1,
      duration: 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressed, {
      toValue: 0,
      speed: 24,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  const animatedStyle = {
    opacity: pressed.interpolate({
      inputRange: [0, 1],
      outputRange: [1, dimTo],
      extrapolate: "clamp",
    }),
    transform: [
      {
        scale: pressed.interpolate({
          inputRange: [0, 1],
          outputRange: [1, scaleTo],
        }),
      },
    ],
  };

  return (
    <Pressable
      onPress={onPress ? (event) => { haptic.light(); onPress(event); } : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={hitSlop}
      style={wrapperStyle}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
    >
      <Animated.View style={[style, animatedStyle]}>
        {typeof children === "function" ? children(pressed) : children}
      </Animated.View>
    </Pressable>
  );
}

/** One theme option. The selection state animates (ring, dot, checkmark). */
function ThemeSwatch({ item, selected, onSelect, styles }) {
  const sel = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    const anim = Animated.spring(sel, {
      toValue: selected ? 1 : 0,
      speed: 22,
      bounciness: 6,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [selected, sel]);

  return (
    <ScalePressable
      wrapperStyle={styles.themeCell}
      style={styles.themeCellInner}
      onPress={() => onSelect(item.id)}
      scaleTo={PRESS_SCALE_BUTTON}
      dimTo={0.9}
      accessibilityLabel={item.name + " theme"}
      accessibilityState={{ selected }}
    >
      <View style={[styles.swatchRing, { backgroundColor: item.light }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swatchSelectedRing,
            {
              borderColor: item.deep,
              opacity: sel.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
                extrapolate: "clamp",
              }),
              transform: [
                {
                  scale: sel.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.swatchDot,
            {
              backgroundColor: item.primary,
              borderBottomColor: item.deep,
              opacity: sel.interpolate({
                inputRange: [0, 1],
                outputRange: [0.75, 1],
                extrapolate: "clamp",
              }),
              transform: [
                {
                  scale: sel.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Animated.View
            style={{
              opacity: sel.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
                extrapolate: "clamp",
              }),
              transform: [
                {
                  scale: sel.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 1],
                  }),
                },
              ],
            }}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
          </Animated.View>
        </Animated.View>
      </View>

      <Text
        style={[styles.swatchLabel, selected && styles.swatchLabelSelected]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
    </ScalePressable>
  );
}

export default function ProfileScreen({
  user,
  ranking = [],
  onBack,
  onLogout,
  onHome,
  onCourses,
  onRanking,
}) {
  const { colors, theme, themes, themeId, setThemeId } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Only new behavior: Appearance can collapse/expand
  const [appearanceOpen, setAppearanceOpen] = useState(true);

  const position = useMemo(() => {
    const others = ranking.filter((item) => item.id !== user.id);
    const combined = [...others, { id: user.id, xp: user.xp }].sort(
      (a, b) => b.xp - a.xp
    );
    return combined.findIndex((item) => item.id === user.id) + 1;
  }, [user, ranking]);

  // Staggered entrance: one value per section
  const entrances = useRef(
    Array.from({ length: SECTION_COUNT }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const anim = Animated.stagger(
      55,
      entrances.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    );
    anim.start();
    return () => anim.stop();
  }, [entrances]);

  // Theme name fades in when the theme changes
  const nameAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    nameAnim.setValue(0);
    Animated.timing(nameAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [themeId, nameAnim]);

  const toggleAppearance = () => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      )
    );

    setAppearanceOpen((prev) => !prev);
  };

  const xpNumber = Number(user.xp) || 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={riseInStyle(entrances[0])}>
          <View style={styles.header}>
            <ScalePressable
              onPress={onBack}
              style={styles.backButton}
              scaleTo={PRESS_SCALE_BUTTON}
              hitSlop={SMALL_HIT_SLOP}
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </ScalePressable>

            <Text style={styles.headerTitle}>Profile</Text>

            <View style={styles.headerSpacer} />
          </View>
        </Animated.View>

        {/* Identity */}
        <Animated.View style={riseInStyle(entrances[1])}>
          <View style={styles.identity}>
            <View style={styles.avatarHalo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getInitials(user.name)}
                </Text>
              </View>
            </View>

            <Text style={styles.name} numberOfLines={1}>
              {user.name}
            </Text>

            {!!user.role && (
              <Text style={styles.roleText}>{user.role}</Text>
            )}
          </View>
        </Animated.View>

        {/* Progress */}
        <Animated.View style={riseInStyle(entrances[2])}>
          <LinearGradient
            colors={[colors.orange, colors.orangeDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statsCard}
          >
            <View style={styles.statsTop}>
              <XpProgressRing
                xp={user.xp}
                size={74}
                strokeWidth={7}
              />

              <View style={styles.xpBlock}>
                <Text style={styles.xpValue}>
                  {xpNumber.toLocaleString()}
                </Text>
                <Text style={styles.xpLabel}>TOTAL XP</Text>
              </View>
            </View>

            <View style={styles.statsRule} />

            <View style={styles.statsBottom}>
              <View style={styles.miniStat}>
                <View style={styles.miniStatValueRow}>
                  <Ionicons name="flame" size={16} color="#fff" />
                  <Text style={styles.miniStatValue}>
                    {user.streak ?? 0}
                  </Text>
                </View>
                <Text style={styles.miniStatLabel}>Day streak</Text>
              </View>

              <View style={styles.miniDivider} />

              <View style={styles.miniStat}>
                <View style={styles.miniStatValueRow}>
                  <Ionicons name="trophy" size={15} color="#fff" />
                  <Text style={styles.miniStatValue}>
                    #{position}
                  </Text>
                </View>
                <Text style={styles.miniStatLabel}>Weekly rank</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Appearance */}
        <Animated.View style={riseInStyle(entrances[3])}>
          <View style={styles.divider} />

          <Pressable
            onPress={() => { haptic.light(); toggleAppearance(); }}
            style={styles.appearanceHeaderButton}
            accessibilityRole="button"
            accessibilityLabel="Appearance settings"
            accessibilityState={{ expanded: appearanceOpen }}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>APPEARANCE</Text>
                <Text style={styles.sectionSubtitle}>
                  Choose your theme
                </Text>
              </View>

              <View style={styles.appearanceHeaderRight}>
                <Animated.Text
                  style={[
                    styles.themeName,
                    {
                      opacity: nameAnim,
                      transform: [
                        {
                          translateY: nameAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [4, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                  numberOfLines={1}
                >
                  {theme.name}
                </Animated.Text>

                <Ionicons
                  name={
                    appearanceOpen
                      ? "chevron-up"
                      : "chevron-down"
                  }
                  size={18}
                  color={colors.textMuted}
                  style={styles.appearanceChevron}
                />
              </View>
            </View>
          </Pressable>

          {appearanceOpen && (
            <View style={styles.themeGrid}>
              {themes.map((item) => (
                <ThemeSwatch
                  key={item.id}
                  item={item}
                  selected={item.id === themeId}
                  onSelect={setThemeId}
                  styles={styles}
                />
              ))}
            </View>
          )}
        </Animated.View>

        {/* Feedback settings */}
        <Animated.View style={riseInStyle(entrances[4])}>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>FEEDBACK</Text>
          <FeedbackSettings />
        </Animated.View>

        {/* EA Coach — coming soon (intentionally not interactive) */}
        <Animated.View style={riseInStyle(entrances[5])}>
          <View style={styles.divider} />

          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>EA COACH</Text>
              <Text style={styles.sectionSubtitle}>
                Personalized learning support
              </Text>
            </View>

            <View style={styles.soonPill}>
              <Text style={styles.soonPillText}>Coming soon</Text>
            </View>
          </View>

          <View
            style={styles.soonCard}
            accessible
            accessibilityLabel="EA Coach. Coming soon in a future update."
          >
            <View style={styles.soonIcon}>
              <Ionicons
                name="sparkles"
                size={18}
                color={colors.orangeDeep}
              />
            </View>

            <Text style={styles.soonText}>
              We’re building a smarter coach that will make your learning
              experience more personal.
            </Text>
          </View>
        </Animated.View>

        {/* Account */}
        <Animated.View style={riseInStyle(entrances[6])}>
          <View style={styles.divider} />

          <Text style={[styles.sectionTitle, styles.accountTitle]}>
            ACCOUNT
          </Text>

          <View style={styles.infoRow}>
            <Ionicons
              name="mail-outline"
              size={18}
              color={colors.textMuted}
              style={styles.infoIcon}
            />

            <View style={styles.infoTextBlock}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text
                style={styles.infoValue}
                numberOfLines={1}
              >
                {user.email}
              </Text>
            </View>
          </View>

          {!!user.role && (
            <>
              <View style={styles.infoDivider} />

              <View style={styles.infoRow}>
                <Ionicons
                  name="briefcase-outline"
                  size={18}
                  color={colors.textMuted}
                  style={styles.infoIcon}
                />

                <View style={styles.infoTextBlock}>
                  <Text style={styles.infoLabel}>Role</Text>
                  <Text
                    style={styles.infoValue}
                    numberOfLines={1}
                  >
                    {user.role}
                  </Text>
                </View>
              </View>
            </>
          )}
        </Animated.View>

        {/* Log out */}
        <Animated.View
          style={[
            styles.logoutWrap,
            riseInStyle(entrances[7]),
          ]}
        >
          <DuoButton
            label="Log out"
            variant="danger"
            onPress={onLogout}
            icon={
              <Ionicons
                name="log-out-outline"
                size={18}
                color="#fff"
              />
            }
          />
        </Animated.View>
      </ScrollView>

      <BottomNavBar
        active="profile"
        onNavigate={(tab) => {
          if (tab === "home") onHome();
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
        }}
      />
    </View>
  );
}

// Styles are built from the active theme's colors. StyleSheet.create at module
// level would freeze the colors at app start, so this runs inside useMemo.
const createStyles = (colors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.screenBg,
    },

    container: {
      flex: 1,
    },

    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 54,
      paddingBottom: 120,
    },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 24,
    },

    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },

    headerTitle: {
      flex: 1,
      fontSize: 20,
      fontWeight: "800",
      textAlign: "center",
      color: colors.text,
      letterSpacing: -0.3,
    },

    headerSpacer: {
      width: 40,
    },

    // Identity
    identity: {
      alignItems: "center",
      marginBottom: 26,
    },

    avatarHalo: {
      width: 124,
      height: 124,
      borderRadius: 62,
      backgroundColor: colors.orangeLight,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },

    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.orange,
      alignItems: "center",
      justifyContent: "center",
      borderBottomWidth: 5,
      borderBottomColor: colors.orangeDeep,
      shadowColor: colors.orangeDeep,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 12,
      elevation: 6,
    },

    avatarText: {
      color: "#fff",
      fontSize: 34,
      fontWeight: "900",
      letterSpacing: -0.5,
    },

    name: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.5,
      maxWidth: "100%",
    },

    roleText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
      marginTop: 4,
    },

    // Stats
    statsCard: {
      borderRadius: radius.xl,
      padding: 18,
      marginBottom: 26,
      borderBottomWidth: 5,
      borderBottomColor: colors.orangeDeep,
    },

    statsTop: {
      flexDirection: "row",
      alignItems: "center",
    },

    xpBlock: {
      flex: 1,
      marginLeft: 18,
    },

    xpValue: {
      color: "#fff",
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: -1,
    },

    xpLabel: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1,
      marginTop: 2,
    },

    statsRule: {
      height: 1,
      backgroundColor: "rgba(255,255,255,0.3)",
      marginVertical: 16,
    },

    statsBottom: {
      flexDirection: "row",
      alignItems: "center",
    },

    miniStat: {
      flex: 1,
      alignItems: "center",
    },

    miniStatValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    miniStatValue: {
      color: "#fff",
      fontSize: 20,
      fontWeight: "800",
    },

    miniStatLabel: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.4,
      marginTop: 4,
    },

    miniDivider: {
      width: 1,
      height: 34,
      backgroundColor: "rgba(255,255,255,0.3)",
    },

    // Shared section structure
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: 22,
    },

    appearanceHeaderButton: {
      marginBottom: 0,
    },

    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
    },

    sectionHeaderText: {
      flexShrink: 1,
    },

    sectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: 0.6,
    },

    sectionSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 3,
    },

    appearanceHeaderRight: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: 12,
    },

    appearanceChevron: {
      marginLeft: 8,
    },

    // Appearance
    themeName: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.orangeDeep,
      maxWidth: 120,
    },

    themeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 6,
    },

    themeCell: {
      width: "25%",
      marginBottom: 12,
    },

    themeCellInner: {
      alignItems: "center",
    },

    swatchRing: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
    },

    swatchSelectedRing: {
      position: "absolute",
      top: -3,
      left: -3,
      right: -3,
      bottom: -3,
      borderRadius: 31,
      borderWidth: 3,
    },

    swatchDot: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderBottomWidth: 3,
      alignItems: "center",
      justifyContent: "center",
    },

    swatchLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textMuted,
      marginTop: 8,
    },

    swatchLabelSelected: {
      color: colors.text,
    },

    // EA Coach (coming soon)
    soonPill: {
      backgroundColor: colors.orangeLight,
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginLeft: 12,
    },

    soonPillText: {
      fontSize: 11,
      fontWeight: "800",
      color: colors.orangeDeep,
      letterSpacing: 0.3,
    },

    soonCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bgSecondary,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      padding: 16,
      marginBottom: 26,
    },

    soonIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.orangeLight,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },

    soonText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },

    // Account
    accountTitle: {
      marginBottom: 6,
    },

    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
    },

    infoIcon: {
      width: 24,
      marginRight: 12,
    },

    infoTextBlock: {
      flex: 1,
    },

    infoLabel: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: "700",
    },

    infoValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginTop: 2,
    },

    infoDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 36,
    },

    logoutWrap: {
      marginTop: 24,
    },
  });