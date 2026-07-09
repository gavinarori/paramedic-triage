import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { PriorityLevel, getPriorityColors, isCriticalPriority } from '../utils/colors';
import { COLORS } from '../utils/colors';

interface PrioritySelectorProps {
  value: PriorityLevel | null;
  onChange: (priority: PriorityLevel) => void;
  error?: string;
}

const PRIORITIES: PriorityLevel[] = [1, 2, 3, 4, 5];

/**
 * Large, unmistakable priority picker. Critical levels (1 & 2) render larger
 * and with hazard coloring so they are the first thing a paramedic's eye
 * lands on, even glancing at the screen quickly under stress.
 */
export function PrioritySelector({ value, onChange, error }: PrioritySelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Priority Level *</Text>
      <View style={styles.row}>
        {PRIORITIES.map((priority) => {
          const colors = getPriorityColors(priority);
          const selected = value === priority;
          const critical = isCriticalPriority(priority);

          return (
            <TouchableOpacity
              key={priority}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Priority ${priority}, ${colors.label}`}
              activeOpacity={0.75}
              onPress={() => onChange(priority)}
              style={[
                styles.button,
                critical && styles.criticalButton,
                {
                  backgroundColor: selected ? colors.background : COLORS.surface,
                  borderColor: colors.background,
                  borderWidth: selected ? 3 : 2,
                },
              ]}
            >
              <Text
                style={[
                  styles.number,
                  { color: selected ? colors.text : colors.background },
                  critical && styles.criticalNumber,
                ]}
              >
                {priority}
              </Text>
              <Text
                style={[
                  styles.badgeLabel,
                  { color: selected ? colors.text : colors.background },
                ]}
              >
                {colors.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  criticalButton: {
    minHeight: 76,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  number: {
    fontSize: 22,
    fontWeight: '800',
  },
  criticalNumber: {
    fontSize: 26,
  },
  badgeLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: 6,
    fontWeight: '600',
  },
});