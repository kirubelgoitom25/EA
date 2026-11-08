import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";

import { REQUEST_STATUS, dateText, durationText, money, planDurationText } from "../services/access";
import { fetchMyPaymentRequests } from "../services/api";
import { layout, space, tokens } from "../theme";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";
import Header from "./ui/Header";
import Screen from "./ui/Screen";
import { QUIET_REFRESH, RowsSkeleton } from "./ui/Skeleton";

const TONES = {
  pending: { background: tokens.mist, color: tokens.textSecondary },
  approved: { background: tokens.correctTint, color: tokens.correct },
  rejected: { background: tokens.wrongTint, color: tokens.wrongText },
};

// Every payment request the student has sent, newest first, each with its own status.
export default function PaymentRequestsScreen({ backLabel, onBack, onSubmitAgain }) {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRequests(await fetchMyPaymentRequests());
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <Screen pulsing={refreshing} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} {...QUIET_REFRESH} />}>
      <Header title="Payment requests" backLabel={backLabel} onBack={onBack} />
      {error ? <AppText tone="secondary" style={styles.message}>{error}</AppText> : null}
      {!requests && !error ? <RowsSkeleton count={3} /> : null}
      {requests?.length === 0 ? (
        <EmptyState title="No requests yet" message="When you pay for a course or for EA Pro, you can follow it here." />
      ) : null}
      {(requests ?? []).map((request) => (
        <RequestCard key={request.id} request={request} onSubmitAgain={onSubmitAgain} />
      ))}
    </Screen>
  );
}

export function RequestCard({ request, onSubmitAgain }) {
  const status = REQUEST_STATUS[request.status] ?? REQUEST_STATUS.pending;
  const tone = TONES[status.tone];
  const rejected = request.status === "rejected";
  const plan = request.kind === "plan";
  const duration = plan ? `EA Pro for ${planDurationText(request.accessDays)}` : durationText(request.accessDays);

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <AppText variant="bodyStrong" numberOfLines={2} style={styles.title}>{request.courseTitle}</AppText>
        <View style={[styles.pill, { backgroundColor: tone.background }]}>
          <AppText variant="caption" style={{ color: tone.color }}>{status.label}</AppText>
        </View>
      </View>
      <AppText variant="caption" tone="secondary">
        {`${money(request.amount, request.currency)} · ${duration} · ${dateText(request.createdAt)}`}
      </AppText>
      {rejected ? (
        <>
          <AppText style={styles.reason}>{request.reviewNote || "No reason was given."}</AppText>
          <Button label="Submit again" variant="text" onPress={() => onSubmitAgain(request)} style={styles.again} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { marginTop: space.xl, textAlign: "center" },
  card: {
    paddingVertical: space.md,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.divider,
  },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flex: 1 },
  pill: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: layout.radius },
  reason: { marginTop: space.xs },
  again: { alignSelf: "flex-start" },
});
