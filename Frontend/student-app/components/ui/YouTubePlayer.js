import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { space, tokens } from "../../theme";
import AppText from "./AppText";
import Button from "./Button";

// A YouTube video played inside the app (YouTube's IFrame player in a WebView). It only plays: it
// never reports "done", so watching or opening a video does not complete anything. The student
// presses Mark complete themselves.
//
// If the video can't be shown (no connection, embedding switched off by its owner, removed), the
// player says so and offers the same video in YouTube.
//
// react-native-webview is a native module, so it is loaded only on phones. The web build of the
// app falls back to the preview that opens YouTube.
const WebView = Platform.OS === "web" ? null : require("react-native-webview").WebView;

// YouTube's own error codes: the owner doesn't allow playing it in other apps / it was removed or
// made private. Anything else (and no answer at all) is treated as a connection problem.
const NO_EMBED = new Set([101, 150, 153]);
const GONE = new Set([2, 100]);
const GIVE_UP_MS = 30000;
// YouTube refuses embeds from a page that claims to be youtube.com itself (errors 152/153) and wants
// the embedding app to identify itself. The player page is therefore served from an origin named
// after the app's package, which is also what YouTube sees as the referrer.
const EMBED_ORIGIN = "https://com.anonymous.studentapp";

const htmlFor = (id) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p{position:absolute;inset:0;width:100%;height:100%}</style>
</head><body><div id="p"></div>
<script>
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}
var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=function(){post({t:'error',code:'load'})};document.head.appendChild(s);
function onYouTubeIframeAPIReady(){
  new YT.Player('p',{videoId:'${id}',width:'100%',height:'100%',
    playerVars:{playsinline:1,rel:0,modestbranding:1,fs:1,origin:'${EMBED_ORIGIN}',widget_referrer:'${EMBED_ORIGIN}'},
    events:{onReady:function(){post({t:'ready'})},onError:function(e){post({t:'error',code:e.data})}}});
}
</script></body></html>`;

export default function YouTubePlayer({ videoId, url }) {
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [errorCode, setErrorCode] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const html = useMemo(() => htmlFor(videoId), [videoId]);
  const openInYouTube = useCallback(() => Linking.openURL(url).catch(() => {}), [url]);

  // A player that never says it is ready (offline, blocked) is treated as an error.
  useEffect(() => {
    if (!WebView) return undefined;
    setPhase("loading");
    setErrorCode(null);
    const timer = setTimeout(() => {
      if (phaseRef.current === "loading") setPhase("error");
    }, GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [videoId, attempt]);

  const onMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.t === "ready") setPhase("ready");
      if (message.t === "error") {
        setErrorCode(message.code);
        setPhase("error");
      }
    } catch (error) {
      // Not one of ours: ignore.
    }
  };

  if (!WebView || phase === "error") {
    return (
      <Fallback
        videoId={videoId}
        onOpen={openInYouTube}
        onRetry={WebView && !GONE.has(Number(errorCode)) && !NO_EMBED.has(Number(errorCode)) ? () => setAttempt((n) => n + 1) : null}
        message={
          NO_EMBED.has(Number(errorCode))
            ? "This video can't be played inside the app."
            : GONE.has(Number(errorCode))
              ? "This video isn't available any more."
              : WebView
                ? "The video couldn't load. Check your connection."
                : null
        }
      />
    );
  }

  return (
    <View style={styles.playerFrame} accessibilityLabel="Video player">
      <WebView
        key={attempt}
        source={{ html, baseUrl: EMBED_ORIGIN }}
        originWhitelist={["*"]}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction
        setSupportMultipleWindows={false}
        onMessage={onMessage}
        onError={() => setPhase("error")}
        onHttpError={() => setPhase("error")}
        // Links inside the player (the YouTube logo, suggestions) open in YouTube, not in this frame.
        onShouldStartLoadWithRequest={(request) => {
          if (request.isTopFrame === false || !/^https?:/.test(request.url)) return true;
          let path = "";
          try {
            path = new URL(request.url).pathname;
          } catch (error) {
            return true;
          }
          if (path === "/" || path === "") return true; // the page itself
          Linking.openURL(request.url).catch(() => {});
          return false;
        }}
      />
      {phase === "loading" ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={tokens.onAccentStrong} />
          <AppText variant="caption" style={styles.loadingText}>
            Loading video…
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

// The video can't play here: its picture, why, and the way out.
function Fallback({ videoId, onOpen, onRetry, message }) {
  return (
    <View style={styles.fallbackWrap}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Watch the video on YouTube"
        style={({ pressed }) => [styles.frame, pressed && styles.pressed]}
      >
        {videoId ? <Image source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }} style={styles.thumb} /> : null}
        <View style={styles.play}>
          <Feather name="play" size={28} color={tokens.onAccentStrong} />
        </View>
      </Pressable>
      {message ? (
        <AppText variant="label" tone="secondary" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      <Button label="Open in YouTube" variant="text" icon="open-outline" onPress={onOpen} />
      {onRetry ? <Button label="Try again" variant="text" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: tokens.plum,
    alignItems: "center",
    justifyContent: "center",
  },
  // No overflow clipping around the WebView: on Android a clipped, rounded parent can stop it painting.
  playerFrame: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  web: { flex: 1, width: "100%", backgroundColor: "#000" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.plum,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  loadingText: { color: tokens.onPlumSecondary },
  fallbackWrap: { gap: space.sm },
  thumb: { ...StyleSheet.absoluteFillObject, opacity: 0.85 },
  play: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: tokens.accentLip,
    alignItems: "center",
    justifyContent: "center",
  },
  message: { textAlign: "center" },
  pressed: { opacity: 0.8 },
});
