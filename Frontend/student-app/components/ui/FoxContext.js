import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { createBrain } from "../../services/foxBrain";
import { feedback, haptic } from "../../services/feedback";

// What the fox is feeling right now, for the whole app. Screens report what happened with
// `useFoxReact()("correct")`; the brain (services/foxBrain.js) decides her reaction; every fox that is
// `reactive` shows it. Two contexts, so a screen that only reports events does not re-render every
// time she changes mood.
const IDLE_AFTER = 25000; // she dozes off when nothing has happened for this long
const LAST_OPEN = "ea.fox.lastOpen";
const NEUTRAL = { mood: "idle", effect: null, caption: undefined, nonce: 0, hold: 0 };

const ReactionContext = createContext(NEUTRAL);
const ActionsContext = createContext({ react: () => {}, register: () => () => {}, wake: () => {} });

export function FoxProvider({ children }) {
  const brain = useMemo(() => createBrain(), []);
  const [reaction, setReaction] = useState(NEUTRAL);
  const lastOpen = useRef(null);
  const greeted = useRef(false); // she says hello once per launch, not every time Home opens
  const live = useRef(0); // reactive foxes on screen: she only dozes off when someone can see her
  const calmTimer = useRef(null);
  const idleTimer = useRef(null);
  const active = useRef(AppState.currentState === "active");

  useEffect(() => {
    AsyncStorage.getItem(LAST_OPEN)
      .then((value) => {
        if (value) lastOpen.current = Number(value) || null;
      })
      .catch(() => {});
    const subscription = AppState.addEventListener("change", (state) => {
      active.current = state === "active";
      if (!active.current) clearTimeout(idleTimer.current);
    });
    return () => {
      subscription.remove();
      clearTimeout(calmTimer.current);
      clearTimeout(idleTimer.current);
    };
  }, []);

  const show = useCallback(
    (next) => {
      if (!next) return;
      clearTimeout(calmTimer.current);
      setReaction(next);
      if (next.hold > 0) calmTimer.current = setTimeout(() => setReaction(brain.calm()), next.hold);
    },
    [brain],
  );

  const armIdle = useCallback(() => {
    clearTimeout(idleTimer.current);
    if (live.current <= 0 || !active.current) return;
    idleTimer.current = setTimeout(() => show(brain.react("idle")), IDLE_AFTER);
  }, [brain, show]);

  const react = useCallback(
    (event, info = {}) => {
      const extra = { hour: new Date().getHours(), sound: feedback.getSettings().sound };
      if (event === "open") {
        if (greeted.current) return;
        greeted.current = true;
        extra.daysAway = lastOpen.current ? Math.floor((Date.now() - lastOpen.current) / 86400000) : 0;
        lastOpen.current = Date.now();
        AsyncStorage.setItem(LAST_OPEN, String(lastOpen.current)).catch(() => {});
      }
      show(brain.react(event, { ...extra, ...info }));
      if (event === "tap") haptic.light();
      armIdle();
    },
    [brain, show, armIdle],
  );

  // Any touch anywhere wakes her and starts the doze timer again.
  const wake = useCallback(() => {
    show(brain.react("wake"));
    armIdle();
  }, [brain, show, armIdle]);

  const register = useCallback(() => {
    live.current += 1;
    armIdle();
    return () => {
      live.current -= 1;
      if (live.current <= 0) clearTimeout(idleTimer.current);
    };
  }, [armIdle]);

  const actions = useMemo(() => ({ react, register, wake }), [react, register, wake]);

  return (
    <ActionsContext.Provider value={actions}>
      <ReactionContext.Provider value={reaction}>
        <View style={{ flex: 1 }} onTouchStart={wake}>
          {children}
        </View>
      </ReactionContext.Provider>
    </ActionsContext.Provider>
  );
}

// Report something that happened: useFoxReact()("correct"). Does nothing outside a provider.
export const useFoxReact = () => useContext(ActionsContext).react;

// The fox's current reaction. Pass listening = true from a fox that is on screen, so she can doze off.
export function useFoxReaction(listening = false) {
  const { register } = useContext(ActionsContext);
  useEffect(() => (listening ? register() : undefined), [listening, register]);
  return useContext(ReactionContext);
}
