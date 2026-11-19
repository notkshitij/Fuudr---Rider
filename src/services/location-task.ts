import { getLocationRuntime, isLocationTrackingSupported } from '@/services/location-runtime';

import { recordTrackingError, saveRiderLocation } from '@/services/location-tracking';

if (isLocationTrackingSupported()) getLocationRuntime().defineLocationTask({
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
