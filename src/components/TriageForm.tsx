import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { PrioritySelector } from './PrioritySelector';
import { COLORS } from '../utils/colors';
import { validateTriageInput } from '../utils/validation';
import { NewTriageInput, PriorityLevel, TriageStatus, ValidationResult } from '../types';

interface TriageFormProps {
  onSubmit: (input: NewTriageInput) => Promise<void> | void;
  isSubmitting: boolean;
}

const STATUS_OPTIONS: TriageStatus[] = ['Pending', 'In-Transit'];

/**
 * Reusable, presentation-focused form. Contains only local UI state
 * (field values, validation errors) — it knows nothing about storage,
 * Redux, or the network. The parent screen owns submission/sync behavior.
 */
export function TriageForm({ onSubmit, isSubmitting }: TriageFormProps) {
  const [patientName, setPatientName] = useState('');
  const [conditionDescription, setConditionDescription] = useState('');
  const [priority, setPriority] = useState<PriorityLevel | null>(null);
  const [status, setStatus] = useState<TriageStatus>('Pending');
  const [errors, setErrors] = useState<ValidationResult['errors']>({});

  const resetForm = useCallback(() => {
    setPatientName('');
    setConditionDescription('');
    setPriority(null);
    setStatus('Pending');
    setErrors({});
  }, []);

  const handleSubmit = useCallback(async () => {
    const input: Partial<NewTriageInput> = {
      patientName,
      conditionDescription,
      priority: priority ?? undefined,
      status,
    };

    const result = validateTriageInput(input);
    setErrors(result.errors);

    if (!result.isValid) {
      return;
    }

    await onSubmit(input as NewTriageInput);
    resetForm();
  }, [patientName, conditionDescription, priority, status, onSubmit, resetForm]);

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <Text style={styles.label}>Patient Name *</Text>
        <TextInput
          style={[styles.input, errors.patientName ? styles.inputError : null]}
          value={patientName}
          onChangeText={setPatientName}
          placeholder="e.g. John Doe"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="words"
          returnKeyType="next"
          editable={!isSubmitting}
        />
        {errors.patientName ? <Text style={styles.errorText}>{errors.patientName}</Text> : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Condition Description *</Text>
        <TextInput
          style={[styles.input, styles.multiline, errors.conditionDescription ? styles.inputError : null]}
          value={conditionDescription}
          onChangeText={setConditionDescription}
          placeholder="e.g. Severe chest pain, difficulty breathing"
          placeholderTextColor={COLORS.textSecondary}
          multiline
          numberOfLines={3}
          editable={!isSubmitting}
        />
        {errors.conditionDescription ? (
          <Text style={styles.errorText}>{errors.conditionDescription}</Text>
        ) : null}
      </View>

      <PrioritySelector value={priority} onChange={setPriority} error={errors.priority} />

      <View style={styles.field}>
        <Text style={styles.label}>Status *</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((option) => {
            const selected = status === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.statusButton, selected && styles.statusButtonSelected]}
                onPress={() => setStatus(option)}
                disabled={isSubmitting}
              >
                <Text style={[styles.statusText, selected && styles.statusTextSelected]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.status ? <Text style={styles.errorText}>{errors.status}</Text> : null}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Submit triage record"
      >
        {isSubmitting ? (
          <ActivityIndicator color={COLORS.textInverse} />
        ) : (
          <Text style={styles.submitText}>SUBMIT TRIAGE RECORD</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: 6,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  statusButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  statusTextSelected: {
    color: COLORS.textInverse,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  submitText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});