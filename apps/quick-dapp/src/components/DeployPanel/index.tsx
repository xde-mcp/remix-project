import React, { useContext, useState, useEffect } from 'react';
import { Form, Button, Alert, Card } from 'react-bootstrap';
import { ethers, namehash } from 'ethers';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  emptyInstance,
  resetInstance,
  getInfoFromNatSpec,
} from '../../actions';
import { ThemeUI } from './theme';
import { CustomTooltip } from '@remix-ui/helper';
import { AppContext } from '../../contexts';
import IpfsHttpClient from 'ipfs-http-client';
import { readDappFiles } from '../EditHtmlTemplate';
import { InBrowserVite } from '../../InBrowserVite';
import * as contentHash  from 'content-hash';
import { CID } from 'multiformats/cid';

const ENS_RESOLVER_ABI = [
  "function setContenthash(bytes32 node, bytes calldata hash) external"
];

function DeployPanel(): JSX.Element {
  const intl = useIntl()
  const { appState, dispatch } = useContext(AppContext);
  const { verified, natSpec, noTerminal } = appState.instance;
  const [formVal, setFormVal] = useState<any>({
    shortname: localStorage.getItem('__DISQUS_SHORTNAME') || '',
    shareTo: [],
  });

  const [showIpfsSettings, setShowIpfsSettings] = useState(false);
  const [ipfsHost, setIpfsHost] = useState('');
  const [ipfsPort, setIpfsPort] = useState('');
  const [ipfsProtocol, setIpfsProtocol] = useState('');
  const [ipfsProjectId, setIpfsProjectId] = useState('');
  const [ipfsProjectSecret, setIpfsProjectSecret] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState({ cid: '', error: '' }); 

  const [ensName, setEnsName] = useState('');
  const [isEnsLoading, setIsEnsLoading] = useState(false);
  const [ensResult, setEnsResult] = useState({ success: '', error: '' });

  const getRemixIpfsSettings = () => {
    let result = null;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (key && key.includes('remix.config')) {
        try {
          const data = JSON.parse(localStorage.getItem(key));

          if (data && data["settings/ipfs-url"]) {
            result = {
              url: data["settings/ipfs-url"] || null,
              port: data["settings/ipfs-port"] || null,
              protocol: data["settings/ipfs-protocol"] || null,
              projectId: data["settings/ipfs-project-id"] || null,
              projectSecret: data["settings/ipfs-project-secret"] || null,
            };
            break;
          }
        } catch (err) {
          console.warn(`${key} JSON parse error:`, err);
        }
      }
    }

    return result;
  }

  useEffect(() => {
    const loadGlobalIpfsSettings = () => {
      try {
        const ipfsSettings = getRemixIpfsSettings();

        if (ipfsSettings && ipfsSettings.url) {
          const { 
            url: host, 
            port, 
            protocol, 
            projectId: id, 
            projectSecret: secret 
          } = ipfsSettings;

          setIpfsHost(host);
          setIpfsPort(port || '5001');
          setIpfsProtocol(protocol || 'https');
          setIpfsProjectId(id || '');
          setIpfsProjectSecret(secret || '');
        } 
      } catch (e) {
        console.error(e);
      }
      setShowIpfsSettings(true);
    };
    loadGlobalIpfsSettings();
  }, []);

  const setShareTo = (type: string) => {
    let shareTo = formVal.shareTo;
    if (formVal.shareTo.includes(type)) {
      shareTo = shareTo.filter((item: string) => item !== type);
    } else {
      shareTo.push(type);
    }
    setFormVal({ ...formVal, shareTo });
  };

  const handleIpfsDeploy = async () => {
    setIsDeploying(true);
    setDeployResult({ cid: '', error: '' });

    let builder: InBrowserVite;
    let jsResult: { js: string; success: boolean; error?: string };
    let filesMap: Map<string, string>;

    try {
      builder = new InBrowserVite();
      await builder.initialize();

      filesMap = new Map<string, string>();
      await readDappFiles('dapp', filesMap);

      if (filesMap.size === 0) {
        throw new Error("No DApp files");
      }

      jsResult = await builder.build(filesMap, '/src/main.jsx');
      if (!jsResult.success) {
        throw new Error(`DApp build failed: ${jsResult.error}`);
      }

    } catch (e) {
      console.error(e);
      setDeployResult({ cid: '', error: `DApp build failed: ${e.message}` });
      setIsDeploying(false);
      return;
    }


    let ipfsClient;
    try {
      const auth = (ipfsProjectId && ipfsProjectSecret)
        ? 'Basic ' + Buffer.from(ipfsProjectId + ':' + ipfsProjectSecret).toString('base64')
        : null;
        
      const headers = auth ? { Authorization: auth } : {};
      
      let clientOptions;
      if (ipfsHost) {
        clientOptions = {
          host: ipfsHost.replace(/^(https|http):\/\//, ''), 
          port: parseInt(ipfsPort) || 5001,
          protocol: ipfsProtocol || 'https',
          headers
        };
      } else {
         clientOptions = { host: 'ipfs.infura.io', port: 5001, protocol: 'https', headers };
      }
      
      ipfsClient = IpfsHttpClient(clientOptions);

    } catch (e) {
      console.error(e);
      setDeployResult({ cid: '', error: `IPFS: ${e.message}` });
      setIsDeploying(false);
      return;
    }

    try {
      const indexHtmlContent = filesMap.get('/index.html');
      if (!indexHtmlContent) {
        throw new Error("Cannot find index.html");
      }

      let modifiedHtml = indexHtmlContent;

      modifiedHtml = modifiedHtml.replace(
        /<script type="module"[^>]*src="(?:\/|\.\/)?src\/main\.jsx"[^>]*><\/script>/, 
        '<script type="module" src="./app.js"></script>'
      );
      
      modifiedHtml = modifiedHtml.replace(
        /<link rel="stylesheet"[^>]*href="(?:\/|\.\/)?src\/index\.css"[^>]*>/, 
        ''
      );

      const filesToUpload = [
        {
          path: 'index.html',
          content: modifiedHtml
        },
        {
          path: 'app.js',
          content: jsResult.js
        }
      ];

      let last: any;
      for await (const r of ipfsClient.addAll(filesToUpload, { wrapWithDirectory: true })) {
        last = r;
      }
      const rootCid = last?.cid?.toString() || '';
      setDeployResult({ cid: rootCid, error: '' });
      setIsDeploying(false);
      
      if (showIpfsSettings && ipfsHost) {
      }

    } catch (e) {
      setDeployResult({ cid: '', error: `IPFS: ${e.message}` });
      setIsDeploying(false); 
    }
  };
  
  const handleEnsLink = async () => {
    setIsEnsLoading(true);
    setEnsResult({ success: '', error: '' });

    if (!ensName || !deployResult.cid) {
      setEnsResult({ success: '', error: 'ENS name or IPFS CID is missing.' });
      setIsEnsLoading(false);
      return;
    }
    if (typeof window.ethereum === 'undefined') {
      setEnsResult({ success: '', error: 'MetaMask (or a compatible wallet) is not installed.' });
      setIsEnsLoading(false);
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();

      const network = await provider.getNetwork();
      if (network.chainId !== 1n) {
        throw new Error('Updating ENS records is supported only on Ethereum Mainnet (Chain ID: 1). Please switch your wallet network.');
      }

      const userAddress = await signer.getAddress();

      const ownerAddress = await provider.resolveName(ensName);

      if (!ownerAddress) {
        throw new Error(`'${ensName}' is not registered.`);
      }
      if (ownerAddress.toLowerCase() !== userAddress.toLowerCase()) {
        throw new Error(`The current wallet (${userAddress.slice(0, 6)}...) does not match the address record of '${ensName}'.`);
      }

      const resolver = await provider.getResolver(ensName);
      if (!resolver) {
        throw new Error(`Resolver for '${ensName}' was not found.`);
      }

      const writeableResolver = new ethers.Contract(resolver.address, ENS_RESOLVER_ABI, signer);

      const pureCid = deployResult.cid.replace(/^ipfs:\/\//, '');
      const cidForEns = CID.parse(pureCid).version === 0 ? pureCid : CID.parse(pureCid).toV0().toString();

      const chHex = '0x' + contentHash.encode('ipfs-ns', cidForEns);
      const node = namehash(ensName);

      const tx = await writeableResolver.setContenthash(node, chHex);
      setEnsResult({ success: 'Transaction sent. Waiting for confirmation...', error: '' });
      await tx.wait();

      setEnsResult({ success: `'${ensName}' has been updated to the new DApp CID successfully!`, error: '' });
    } catch (e: any) {
      console.error(e);
      let message = e.message;
      if (e.code === 'UNSUPPORTED_OPERATION' && e.message?.includes('setContenthash')) {
        message = "The current resolver doesn't support 'setContenthash'. You may need to switch to the Public Resolver in the ENS Manager.";
      }
      setEnsResult({ success: '', error: `Failed to update ENS: ${message}` });
    } finally {
      setIsEnsLoading(false);
    }
  };

  return (
    <div className="d-inline-block">
      <h3 className="mb-3" data-id="quick-dapp-admin">QuickDapp <FormattedMessage id="quickDapp.admin" /></h3>
      <Button
        size="sm"
        style={{ height: 32 }}
        data-id="resetFunctions"
        onClick={() => {
          resetInstance();
        }}
      >
        <FormattedMessage id="quickDapp.resetFunctions" />
      </Button>
      <Button
        size="sm"
        style={{ height: 32, width: 100 }}
        data-id="deleteDapp"
        className="ms-3"
        onClick={() => {
          emptyInstance();
        }}
      >
        <FormattedMessage id="quickDapp.deleteDapp" />
      </Button>
      <Form>
        <Form.Group className="mb-2" controlId="formShareTo">
          <Form.Label className="text-uppercase mb-0">
            <FormattedMessage id="quickDapp.shareTo" />
          </Form.Label>
          <br />
          <div className="d-inline-flex align-items-center form-check">
            <input
              id="shareToTwitter"
              className="form-check-input"
              type="checkbox"
              name="group1"
              value="twitter"
              onChange={(e) => {
                setShareTo(e.target.value);
              }}
              checked={formVal.shareTo.includes('twitter')}
            />

            <label
              htmlFor="shareToTwitter"
              className="m-0 form-check-label"
              style={{ paddingTop: 1 }}
            >
              Twitter
            </label>
          </div>
          <div className="d-inline-flex align-items-center form-check ms-3">
            <input
              id="shareToFacebook"
              className="form-check-input"
              type="checkbox"
              name="group1"
              value="facebook"
              onChange={(e) => {
                setShareTo(e.target.value);
              }}
              checked={formVal.shareTo.includes('facebook')}
            />

            <label
              htmlFor="shareToFacebook"
              className="m-0 form-check-label"
              style={{ paddingTop: 1 }}
            >
              Facebook
            </label>
          </div>
        </Form.Group>
        <Form.Group className="mb-2" controlId="formShareTo">
          <Form.Label className="text-uppercase mb-0">
            <FormattedMessage id="quickDapp.useNatSpec" />
          </Form.Label>
          <br />
          <span
            data-id="useNatSpec"
            id="useNatSpec"
            className="btn ai-switch ps-0 py-0"
            onClick={async () => {
              getInfoFromNatSpec(!natSpec.checked);
            }}
          >
            <CustomTooltip
              placement="top"
              tooltipText={intl.formatMessage({ id: 'quickDapp.useNatSpecTooltip' })}
            >
              <i
                className={
                  natSpec.checked
                    ? 'fas fa-toggle-on fa-lg'
                    : 'fas fa-toggle-off fa-lg'
                }
              ></i>
            </CustomTooltip>
          </span>
        </Form.Group>
        <Form.Group className="mb-2" controlId="formVerified">
          <Form.Label className="text-uppercase mb-0">
            <FormattedMessage id="quickDapp.verifiedByEtherscan" />
          </Form.Label>
          <div className="d-flex py-1 align-items-center form-check">
            <input
              id="verifiedByEtherscan"
              className="form-check-input"
              type="checkbox"
              onChange={(e) => {
                dispatch({
                  type: 'SET_INSTANCE',
                  payload: { verified: e.target.checked },
                });
              }}
              checked={verified}
            />

            <label
              htmlFor="verifiedByEtherscan"
              className="m-0 form-check-label"
              style={{ paddingTop: 1 }}
            >
              <FormattedMessage id="quickDapp.verified" />
            </label>
          </div>
        </Form.Group>
        <Form.Group className="mb-2" controlId="formNoTerminal">
          <Form.Label className="text-uppercase mb-0">
            <FormattedMessage id="quickDapp.noTerminal" />
          </Form.Label>
          <div className="d-flex py-1 align-items-center form-check">
            <input
              id="noTerminal"
              className="form-check-input"
              type="checkbox"
              onChange={(e) => {
                dispatch({
                  type: 'SET_INSTANCE',
                  payload: { noTerminal: e.target.checked },
                });
              }}
              checked={noTerminal}
            />

            <label
              htmlFor="noTerminal"
              className="m-0 form-check-label"
              style={{ paddingTop: 1 }}
            >
              <FormattedMessage id="quickDapp.no" />
            </label>
          </div>
        </Form.Group>

        <ThemeUI />
        
        {showIpfsSettings && (
          <>
            <hr />
            <h5 className="mb-2"><FormattedMessage id="quickDapp.ipfsSettings" defaultMessage="IPFS Settings" /></h5>
            {showIpfsSettings && (!ipfsHost || !ipfsPort || !ipfsProtocol) && (
              <Alert variant="info" className="mb-2 small">
                <FormattedMessage
                  id="quickDapp.ipfsSettings.info"
                  defaultMessage="No global IPFS settings found. Please provide credentials below, or configure them in the 'Settings' plugin."
                />
              </Alert>
            )}
            <Form.Group className="mb-2" controlId="formIpfsHost">
              <Form.Label className="text-uppercase mb-0">IPFS Host</Form.Label>
              <Form.Control type="text" placeholder="e.g., ipfs.infura.io" value={ipfsHost} onChange={(e) => setIpfsHost(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-2" controlId="formIpfsPort">
              <Form.Label className="text-uppercase mb-0">IPFS Port</Form.Label>
              <Form.Control type="text" placeholder="e.g., 5001" value={ipfsPort} onChange={(e) => setIpfsPort(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-2" controlId="formIpfsProtocol">
              <Form.Label className="text-uppercase mb-0">IPFS Protocol</Form.Label>
              <Form.Control type="text" placeholder="e.g., https" value={ipfsProtocol} onChange={(e) => setIpfsProtocol(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-2" controlId="formIpfsProjectId">
              <Form.Label className="text-uppercase mb-0">Project ID (Optional)</Form.Label>
              <Form.Control type="text" placeholder="Infura Project ID" value={ipfsProjectId} onChange={(e) => setIpfsProjectId(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-2" controlId="formIpfsProjectSecret">
              <Form.Label className="text-uppercase mb-0">Project Secret (Optional)</Form.Label>
              <Form.Control type="password" placeholder="Infura Project Secret" value={ipfsProjectSecret} onChange={(e) => setIpfsProjectSecret(e.target.value)} />
            </Form.Group>
          </>
        )}
        <hr />

        <Button
          data-id="deployDapp-IPFS"
          variant="primary"
          type="button"
          className="mt-3 w-100"
          onClick={handleIpfsDeploy}
          disabled={isDeploying || (showIpfsSettings && !ipfsHost)}
        >
          {isDeploying ? (
            <><i className="fas fa-spinner fa-spin me-1"></i> <FormattedMessage id="quickDapp.deploying" defaultMessage="Deploying..." /></>
          ) : (
            <FormattedMessage id="quickDapp.deployToIPFS" defaultMessage="Deploy to IPFS" />
          )}
        </Button>

        {deployResult.cid && (
          <Alert variant="success" className="mt-3 small" style={{ wordBreak: 'break-all' }}>
            <div className="fw-bold">Deployed Successfully!</div>
            <div><strong>CID:</strong> {deployResult.cid}</div>
            <hr className="my-2" />
            <a href={`https://gateway.ipfs.io/ipfs/${deployResult.cid}`} target="_blank" rel="noopener noreferrer">
              View on ipfs.io Gateway
            </a>
          </Alert>
        )}
        {deployResult.error && (
          <Alert variant="danger" className="mt-3 small">
            {deployResult.error}
          </Alert>
        )}

        {deployResult.cid && (
          <Card className="mt-3">
            <Card.Body>
              <h5 className="mb-3">Link to ENS</h5>
              <Form.Group className="mb-2" controlId="formEnsName">
                <Form.Label className="text-uppercase mb-0">ENS Name</Form.Label>
                <Form.Control 
                  type="text" 
                  placeholder="e.g., my-dapp.eth" 
                  value={ensName} 
                  onChange={(e) => setEnsName(e.target.value)} 
                />
              </Form.Group>
              <Button 
                variant="secondary" 
                className="w-100" 
                onClick={handleEnsLink} 
                disabled={isEnsLoading || !ensName}
              >
                {isEnsLoading ? (
                  <><i className="fas fa-spinner fa-spin me-1"></i> Linking to ENS...</>
                ) : (
                  'Link ENS Name (Mainnet Only)'
                )}
              </Button>
              {ensResult.success && (
                <Alert variant="success" className="mt-3 small">{ensResult.success}</Alert>
              )}
              {ensResult.error && (
                <Alert variant="danger" className="mt-3 small">{ensResult.error}</Alert>
              )}
            </Card.Body>
          </Card>
        )}
      </Form>
    </div>
  );
}

export default DeployPanel;
