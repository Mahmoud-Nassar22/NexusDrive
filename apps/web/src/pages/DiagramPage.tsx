import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDownloadUrl, uploadFile } from '../api/files';
import { config } from '../config';

const DRAWIO_ORIGIN = new URL(config.drawioUrl).origin;
const EDITOR_URL = `${config.drawioUrl}/?embed=1&proto=json&spin=1&saveAndExit=1&noExitBtn=0`;

/** Loads the file's XML from S3, or returns an empty diagram for a new file. */
async function loadXml(name: string): Promise<string> {
  try {
    const res = await fetch(await getDownloadUrl(name));
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

/**
 * Embeds the self-hosted draw.io editor and speaks its JSON postMessage protocol:
 * init -> we send "load"; save -> we upload to S3; exit -> back to the file list.
 * (S3 bucket CORS must allow GET/PUT from the app origin.)
 */
export function DiagramPage() {
  const { name = 'untitled.drawio' } = useParams();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const post = (msg: object) =>
      frame.current?.contentWindow?.postMessage(JSON.stringify(msg), DRAWIO_ORIGIN);

    async function onMessage(e: MessageEvent) {
      if (e.origin !== DRAWIO_ORIGIN || typeof e.data !== 'string') return;
      const msg = JSON.parse(e.data) as { event: string; xml?: string; exit?: boolean };

      if (msg.event === 'init') {
        post({ action: 'load', xml: await loadXml(name), autosave: 0 });
      } else if (msg.event === 'save' && msg.xml !== undefined) {
        await uploadFile(new Blob([msg.xml]), name, 'application/vnd.jgraph.mxfile');
        post({ action: 'status', message: 'Saved', modified: false });
        if (msg.exit) navigate('/files');
      } else if (msg.event === 'exit') {
        navigate('/files');
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [name, navigate]);

  return <iframe ref={frame} className="drawio" src={EDITOR_URL} title={`Diagram: ${name}`} />;
}
