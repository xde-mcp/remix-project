import React, { useContext, useState, useEffect } from 'react';
import { Form, Button, Alert, InputGroup } from 'react-bootstrap';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  emptyInstance,
  resetInstance,
  getInfoFromNatSpec,
} from '../../actions';
import { ThemeUI } from './theme';
import { CustomTooltip } from '@remix-ui/helper';
import { AppContext } from '../../contexts';

function DeployPanel(): JSX.Element {
  const intl = useIntl()
  const { appState, dispatch } = useContext(AppContext);
  const { verified, natSpec, noTerminal } = appState.instance;
  const [formVal, setFormVal] = useState<any>({
    shortname: localStorage.getItem('__DISQUS_SHORTNAME') || '',
    shareTo: [],
  });
  const setShareTo = (type: string) => {
    let shareTo = formVal.shareTo;
    if (formVal.shareTo.includes(type)) {
      shareTo = shareTo.filter((item: string) => item !== type);
    } else {
      shareTo.push(type);
    }
    setFormVal({ ...formVal, shareTo });
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
        
        <Button
          data-id="deployDapp-IPFS"
          variant="primary"
          type="button" // type="submit"에서 변경
          className="mt-3"
          onClick={() => {
            console.log("Deploying to IPFS/ENS... (TODO)");
          }}
        >
          <FormattedMessage id="quickDapp.deployToIPFS" defaultMessage="Deploy to IPFS & ENS" />
        </Button>
      </Form>
    </div>
  );
}

export default DeployPanel;
