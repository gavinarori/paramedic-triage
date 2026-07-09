import { NewTriageInput, ValidationResult, PriorityLevel } from '../types';

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 100;
const MIN_DESCRIPTION_LENGTH = 3;
const MAX_DESCRIPTION_LENGTH = 500;
const VALID_PRIORITIES: PriorityLevel[] = [1, 2, 3, 4, 5];
const VALID_STATUSES = ['Pending', 'In-Transit'];

/**
 * Validates a triage intake form before it is allowed to be submitted.
 * Designed to catch human error under time pressure (blank fields, no
 * priority selected) without being overly restrictive on free-text content.
 */
export function validateTriageInput(input: Partial<NewTriageInput>): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  const name = input.patientName?.trim() ?? '';
  if (name.length === 0) {
    errors.patientName = 'Patient name is required.';
  } else if (name.length < MIN_NAME_LENGTH) {
    errors.patientName = `Patient name must be at least ${MIN_NAME_LENGTH} characters.`;
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.patientName = `Patient name must be under ${MAX_NAME_LENGTH} characters.`;
  }

  const description = input.conditionDescription?.trim() ?? '';
  if (description.length === 0) {
    errors.conditionDescription = 'Condition description is required.';
  } else if (description.length < MIN_DESCRIPTION_LENGTH) {
    errors.conditionDescription = 'Please provide a more detailed description.';
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.conditionDescription = `Description must be under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }

  if (input.priority === undefined || input.priority === null) {
    errors.priority = 'Priority level must be selected.';
  } else if (!VALID_PRIORITIES.includes(input.priority)) {
    errors.priority = 'Priority must be between 1 and 5.';
  }

  if (!input.status) {
    errors.status = 'Status is required.';
  } else if (!VALID_STATUSES.includes(input.status)) {
    errors.status = 'Invalid status value.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/** Quick single-field check, useful for real-time (on-blur) validation in the form UI */
export function validateField(
  field: keyof NewTriageInput,
  value: unknown,
): string | undefined {
  const probe: Partial<NewTriageInput> = { [field]: value } as Partial<NewTriageInput>;
  const result = validateTriageInput(probe);
  return result.errors[field];
}

export function isValidPriority(value: unknown): value is PriorityLevel {
  return typeof value === 'number' && VALID_PRIORITIES.includes(value as PriorityLevel);
}