import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Loader2, RefreshCw, QrCode, AlertTriangle, Wifi, WifiOff, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface WhatsAppStatus {
  isInitialized: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'unavailable';
  hasQrCode: boolean;
  qrCode: string | null;
  statusMessage?: string;
  lastError?: string | null;
  reconnectAttempts?: number;
  maxReconnectAttempts?: number;
  connectionFailed?: boolean;
  isConnected?: boolean;
  clientReady?: boolean;
  elapsedTime?: string;
  dependencies?: {
    available: boolean;
    missingDependencies: string[];
    errorMessage?: string;
  };
}

const QR_TIMEOUT_MS = 90_000;

export default function WhatsAppSetup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [waitingForQr, setWaitingForQr] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery<WhatsAppStatus>({
    queryKey: ['/api/admin/whatsapp/status'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/whatsapp/status');
      return response.json();
    },
    refetchInterval: 2000,
  });

  const isConnected = status?.connectionStatus === 'connected';
  const hasFailed = !!(status?.connectionFailed && waitingForQr);
  const needsQr =
    !isConnected &&
    !hasFailed &&
    !timedOut &&
    (status?.connectionStatus === 'connecting' ||
      status?.connectionStatus === 'authenticating' ||
      status?.hasQrCode ||
      waitingForQr);

  const qrImage = status?.qrCode || null;

  useEffect(() => {
    if (isConnected) {
      setWaitingForQr(false);
      setTimedOut(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [isConnected]);

  useEffect(() => {
    if (qrImage) {
      setTimedOut(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [qrImage]);

  useEffect(() => {
    if (!waitingForQr || isConnected) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!isConnected) setTimedOut(true);
    }, QR_TIMEOUT_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [waitingForQr, isConnected]);

  const showError = timedOut || hasFailed;
  const errorMessage = hasFailed && status?.lastError
    ? status.lastError
    : 'Não foi possível gerar o QR Code.\nVerifique a conexão e tente novamente.';

  const initializeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/whatsapp/initialize');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'WhatsApp inicializado', description: 'Aguarde o QR Code aparecer.' });
      setWaitingForQr(true);
      setTimedOut(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/whatsapp/status'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao inicializar', description: error.message, variant: 'destructive' });
    },
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/whatsapp/restart');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'WhatsApp reiniciado', description: 'Aguarde o QR Code aparecer.' });
      setWaitingForQr(true);
      setTimedOut(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/whatsapp/status'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao reiniciar', description: error.message, variant: 'destructive' });
    },
  });

  const handleRetry = () => {
    setTimedOut(false);
    setWaitingForQr(false);
    restartMutation.mutate();
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/whatsapp/status'] });
  };

  const isBusy = initializeMutation.isPending || restartMutation.isPending;

  const statusText =
    isConnected
      ? 'Conectado'
      : status?.connectionStatus === 'connecting'
      ? 'Conectando...'
      : status?.connectionStatus === 'authenticating'
      ? 'Aguardando leitura do QR...'
      : 'Desconectado';

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[560px]">

        {/* ── Left Panel ── */}
        <div className="md:w-2/5 bg-[#25D366] flex flex-col items-center justify-between p-10 text-white relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          <div className="relative z-10 text-center">
            <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
              <svg viewBox="0 0 24 24" className="w-14 h-14 fill-white" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold mb-1">WhatsApp</h1>
            <p className="text-white/80 text-sm">Setup de Conexão</p>
          </div>

          {isConnected ? (
            <div className="relative z-10 text-center mt-6 space-y-3">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <p className="text-white font-semibold text-lg">Dispositivo Conectado!</p>
              <p className="text-white/70 text-sm">O WhatsApp está ativo e pronto para receber mensagens.</p>
            </div>
          ) : (
            <div className="relative z-10 w-full space-y-4 mt-8">
              {[
                { n: '1', text: 'Abra o WhatsApp no seu celular' },
                { n: '2', text: 'Toque em Menu ou Configurações → Dispositivos Conectados' },
                { n: '3', text: 'Toque em Conectar um dispositivo' },
                { n: '4', text: 'Aponte a câmera para o QR Code ao lado' },
              ].map((step) => (
                <div key={step.n} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/25 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {step.n}
                  </div>
                  <p className="text-white/90 text-sm leading-snug">{step.text}</p>
                </div>
              ))}
            </div>
          )}

          <div className="relative z-10 mt-8 w-full">
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${isConnected ? 'bg-white/20' : 'bg-white/10'}`}>
              {isConnected ? <Wifi className="w-4 h-4 text-white" /> : <WifiOff className="w-4 h-4 text-white/70" />}
              <span className="text-white/90 text-sm font-medium">{statusText}</span>
              <span className={`ml-auto w-2 h-2 rounded-full animate-pulse ${isConnected ? 'bg-white' : 'bg-amber-300'}`} />
            </div>
            {status?.statusMessage && !isConnected && (
              <p className="text-white/60 text-xs text-center mt-2">{status.statusMessage}</p>
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="md:w-3/5 flex flex-col items-center justify-center p-10 gap-6">

          {statusLoading ? (
            <div className="flex flex-col items-center gap-4 text-gray-400">
              <Loader2 className="h-10 w-10 animate-spin text-[#25D366]" />
              <p className="text-sm">Verificando status...</p>
            </div>

          ) : isConnected ? (
            <div className="flex flex-col items-center gap-6 w-full max-w-xs">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-800 mb-1">Conectado com sucesso</h2>
                <p className="text-gray-500 text-sm">Seu WhatsApp está ativo e funcionando normalmente.</p>
              </div>
              <div className="w-full p-5 bg-green-50 border border-green-200 rounded-2xl text-center space-y-2">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <p className="text-green-800 font-semibold">Serviço ativo</p>
                {status?.elapsedTime && (
                  <p className="text-green-700 text-xs">Neste estado há: {status.elapsedTime}</p>
                )}
              </div>
              <Button
                variant="outline"
                className="w-full rounded-xl border-gray-200"
                onClick={() => restartMutation.mutate()}
                disabled={isBusy}
              >
                {restartMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Reiniciando...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Reiniciar serviço</>
                )}
              </Button>
            </div>

          ) : (
            <>
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-800 mb-1">Conectar dispositivo</h2>
                <p className="text-gray-500 text-sm">
                  {needsQr
                    ? 'Escaneie o QR Code com seu WhatsApp'
                    : showError
                    ? 'Falha na conexão. Tente reconectar.'
                    : 'Clique em Iniciar para gerar o QR Code'}
                </p>
              </div>

              {/* QR Code area */}
              <div>
                {showError ? (
                  <div className="w-60 h-60 border-2 border-dashed border-red-200 rounded-2xl flex flex-col items-center justify-center gap-4 bg-red-50/30 p-4">
                    <XCircle className="h-12 w-12 text-red-400 shrink-0" />
                    <p className="text-sm text-center text-red-600 leading-snug whitespace-pre-line">
                      {errorMessage}
                    </p>
                  </div>
                ) : needsQr ? (
                  !qrImage ? (
                    <div className="w-60 h-60 border-2 border-dashed border-[#25D366]/40 rounded-2xl flex flex-col items-center justify-center gap-3 bg-green-50/30">
                      <Loader2 className="h-10 w-10 animate-spin text-[#25D366]" />
                      <p className="text-sm text-gray-500 font-medium">Gerando QR Code...</p>
                      <p className="text-xs text-gray-400">Conectando aos servidores do WhatsApp</p>
                      {status?.statusMessage && (
                        <p className="text-xs text-gray-400 text-center px-4">{status.statusMessage}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-3 border-2 border-[#25D366] rounded-2xl shadow-lg bg-white">
                        <img
                          src={qrImage}
                          alt="QR Code WhatsApp"
                          className="w-52 h-52 object-contain"
                        />
                      </div>
                      <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse inline-block" />
                        QR Code atualizado automaticamente
                      </p>
                    </div>
                  )
                ) : (
                  <div className="w-60 h-60 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-4 text-gray-400 bg-gray-50">
                    <QrCode className="h-16 w-16 text-gray-300" />
                    <p className="text-sm text-center px-4">
                      Clique em <strong className="text-gray-600">Iniciar Conexão</strong> para gerar o QR Code
                    </p>
                  </div>
                )}
              </div>

              {/* Dependency warning */}
              {status?.dependencies && !status.dependencies.available && (
                <div className="w-full max-w-sm p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-semibold mb-2">
                    <AlertTriangle className="h-4 w-4" /> Dependências faltando
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs text-amber-700">
                    {status.dependencies.missingDependencies.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Buttons */}
              <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                {showError ? (
                  <Button
                    className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold py-5 rounded-xl text-base"
                    onClick={handleRetry}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Reconectando...</>
                    ) : (
                      <><RefreshCw className="h-5 w-5 mr-2" /> Tentar novamente</>
                    )}
                  </Button>
                ) : !status?.isInitialized ? (
                  <Button
                    className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold py-5 rounded-xl text-base"
                    onClick={() => initializeMutation.mutate()}
                    disabled={isBusy}
                  >
                    {initializeMutation.isPending ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Inicializando...</>
                    ) : (
                      <><QrCode className="h-5 w-5 mr-2" /> Iniciar Conexão</>
                    )}
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold py-5 rounded-xl text-base"
                    onClick={() => restartMutation.mutate()}
                    disabled={isBusy}
                  >
                    {restartMutation.isPending ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Reiniciando...</>
                    ) : (
                      <><RefreshCw className="h-5 w-5 mr-2" /> Reconectar</>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full rounded-xl border-gray-200 text-sm"
                  onClick={refresh}
                  disabled={isBusy}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar status
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
