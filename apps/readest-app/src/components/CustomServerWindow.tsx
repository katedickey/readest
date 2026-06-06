import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import Dialog from './Dialog';
import CustomServerForm from './settings/CustomServerForm';

export const setCustomServerDialogVisible = (visible: boolean) => {
  const dialog = document.getElementById('custom_server_window');
  if (dialog) {
    const event = new CustomEvent('setDialogVisibility', {
      detail: { visible },
    });
    dialog.dispatchEvent(event);
  }
};

export const CustomServerWindow = () => {
  const _ = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ visible: boolean }>).detail;
      setIsOpen(detail.visible);
    };

    const el = document.getElementById('custom_server_window');
    if (el) {
      el.addEventListener('setDialogVisibility', handleCustomEvent);
    }

    return () => {
      if (el) {
        el.removeEventListener('setDialogVisibility', handleCustomEvent);
      }
    };
  }, []);

  const handleClose = () => setIsOpen(false);

  return (
    <Dialog
      id='custom_server_window'
      isOpen={isOpen}
      title={_('Custom Server')}
      onClose={handleClose}
      boxClassName='sm:!w-[480px] sm:!max-w-screen-sm sm:h-auto'
      contentClassName='sm:!px-6 sm:!pb-4'
    >
      {isOpen && <CustomServerForm onClose={handleClose} />}
    </Dialog>
  );
};
