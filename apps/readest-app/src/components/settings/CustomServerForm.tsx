import clsx from 'clsx';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { wipeAuthCredentials } from '@/helpers/auth';
import { saveSysSettings } from '@/helpers/settings';
import { CustomServerSettings } from '@/types/settings';
import { SectionTitle } from './primitives';

interface CustomServerFormProps {
  onClose: () => void;
}

const CUSTOM_SERVER_LS_KEY = 'readest.customServer';

type DiscoveredConfig = Omit<CustomServerSettings, 'serverUrl'>;

const isDiscoveredConfig = (value: unknown): value is DiscoveredConfig => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  const stringOrUndefined = (v: unknown) => v === undefined || typeof v === 'string';
  return (
    stringOrUndefined(obj['supabaseUrl']) &&
    stringOrUndefined(obj['supabaseAnonKey']) &&
    stringOrUndefined(obj['objectStorageType']) &&
    stringOrUndefined(obj['s3Endpoint']) &&
    stringOrUndefined(obj['s3BucketName']) &&
    stringOrUndefined(obj['s3Region']) &&
    stringOrUndefined(obj['apiBaseUrl'])
  );
};

const normalizeServerUrl = (url: string): string => url.trim().replace(/\/+$/, '');

const CustomServerForm = ({ onClose }: CustomServerFormProps) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { user } = useAuth();
  const { settings } = useSettingsStore();

  const savedUrl = settings.customServer?.serverUrl ?? '';
  const [serverUrl, setServerUrl] = useState(savedUrl);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredConfig | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const showClearButton = !!savedUrl && serverUrl === savedUrl && !confirmClear;
  const saveEnabled = (!!discovered || confirmClear) && !isSaving;

  const handleConnect = async () => {
    setIsConnecting(true);
    setErrorMessage('');
    setDiscovered(null);
    const normalized = normalizeServerUrl(serverUrl);
    try {
      const response = await fetch(`${normalized}/api/server-config`);
      if (!response.ok) {
        setErrorMessage(_('Could not reach server'));
        return;
      }
      const data: unknown = await response.json();
      if (!isDiscoveredConfig(data)) {
        setErrorMessage(_('Not a Readest server'));
        return;
      }
      setDiscovered(data);
    } catch {
      setErrorMessage(_('Could not reach server'));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage('');
    try {
      if (confirmClear) {
        await saveSysSettings(envConfig, 'customServer', undefined);
        try {
          localStorage.removeItem(CUSTOM_SERVER_LS_KEY);
        } catch {}
        await wipeAuthCredentials();
        window.location.reload();
        return;
      }
      if (!discovered) return;
      const normalized = normalizeServerUrl(serverUrl);
      const next: CustomServerSettings = { serverUrl: normalized, ...discovered };
      await saveSysSettings(envConfig, 'customServer', next);
      try {
        localStorage.setItem(
          CUSTOM_SERVER_LS_KEY,
          JSON.stringify({
            supabaseUrl: discovered.supabaseUrl,
            supabaseAnonKey: discovered.supabaseAnonKey,
            s3Endpoint: discovered.s3Endpoint,
            s3BucketName: discovered.s3BucketName,
            s3Region: discovered.s3Region,
            objectStorageType: discovered.objectStorageType,
            apiBaseUrl: discovered.apiBaseUrl,
          }),
        );
      } catch {}
      await wipeAuthCredentials();
      window.location.reload();
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : _('Could not save');
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='w-full space-y-5'>
      <div className='space-y-1.5'>
        <SectionTitle as='label' htmlFor='custom-server-url' className='block'>
          {_('Server URL')}
        </SectionTitle>
        <div className='flex items-center gap-2'>
          <input
            id='custom-server-url'
            type='text'
            placeholder='https://readest.example.com'
            className='input input-bordered eink-bordered h-11 flex-1 text-sm focus:outline-none disabled:opacity-60'
            spellCheck='false'
            disabled={isSaving}
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value);
              setDiscovered(null);
              setConfirmClear(e.target.value === '' && savedUrl !== '');
              setErrorMessage('');
            }}
          />
          {showClearButton ? (
            <button
              type='button'
              disabled={isSaving}
              onClick={() => {
                setServerUrl('');
                setConfirmClear(true);
                setErrorMessage('');
              }}
              className={clsx(
                'eink-bordered',
                'h-11 rounded-lg px-4 text-sm font-medium',
                'text-error hover:bg-error/10',
                'transition-colors duration-150',
                'focus-visible:ring-error/40 focus-visible:outline-none focus-visible:ring-2',
                isSaving && 'opacity-60',
              )}
            >
              {_('Clear')}
            </button>
          ) : (
            <button
              type='button'
              onClick={handleConnect}
              disabled={isConnecting || isSaving || !serverUrl.trim()}
              className={clsx(
                'eink-bordered',
                'h-11 rounded-lg px-4 text-sm font-medium',
                'hover:bg-base-200',
                'transition-colors duration-150',
                'focus-visible:ring-primary/40 focus-visible:outline-none focus-visible:ring-2',
                (isConnecting || isSaving || !serverUrl.trim()) && 'opacity-60',
              )}
            >
              {isConnecting ? (
                <span className='loading loading-spinner loading-sm' />
              ) : (
                _('Connect')
              )}
            </button>
          )}
        </div>
        {errorMessage && <p className='text-error pt-1 text-xs'>{errorMessage}</p>}
      </div>

      {discovered && (
        <div className='card eink-bordered border-base-200 bg-base-100 border px-4 py-3 text-sm'>
          {user
            ? _('Server found. Press Save to confirm (you will be signed out).')
            : _('Server found. Press Save to confirm.')}
        </div>
      )}

      {confirmClear && (
        <div className='card eink-bordered border-base-200 bg-base-100 border px-4 py-3 text-sm'>
          {user
            ? _(
                'This will remove the custom server. Press Save to confirm (you will be signed out).',
              )
            : _('This will remove the custom server. Press Save to confirm.')}
        </div>
      )}

      <div className='flex justify-end gap-2 pt-1'>
        <button
          type='button'
          onClick={onClose}
          disabled={isSaving}
          className={clsx(
            'eink-bordered',
            'h-10 rounded-lg px-4 text-sm font-medium',
            'hover:bg-base-200',
            'transition-colors duration-150',
            'focus-visible:ring-primary/40 focus-visible:outline-none focus-visible:ring-2',
            isSaving && 'opacity-60',
          )}
        >
          {_('Close')}
        </button>
        <button
          type='button'
          onClick={handleSave}
          disabled={!saveEnabled}
          className={clsx(
            'btn btn-primary',
            'h-10 min-h-10 rounded-lg border-0 px-5 text-sm font-medium',
            'focus-visible:ring-primary/40 focus-visible:outline-none focus-visible:ring-2',
            !saveEnabled && 'opacity-60',
          )}
        >
          {isSaving ? <span className='loading loading-spinner loading-sm' /> : _('Save')}
        </button>
      </div>
    </div>
  );
};

export default CustomServerForm;
