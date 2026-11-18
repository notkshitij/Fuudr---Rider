import { defineLocationTask } from 'expo-location/next';

import { recordTrackingError, saveRiderLocation } from '@/services/location-tracking';

defineLocationTask({
  onPosition: (position) => {
    void saveRiderLocation(position).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Could not save the latest GPS position.';
      void recordTrackingError(message);
    });
  },
  onError: (error) => {
    void recordTrackingError(error.message || 'GPS tracking encountered an error.');
  },
});
