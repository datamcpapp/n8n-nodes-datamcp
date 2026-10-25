import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
  Icon,
} from 'n8n-workflow';

export class DataMcpApi implements ICredentialType {
  name = 'dataMcpApi';
  displayName = 'DataMCP Integration API';
  icon: Icon = {
    light: 'file:../nodes/DataMcp/datamcp-brand.svg',
    dark: 'file:../nodes/DataMcp/datamcp-brand.svg',
  };
  documentationUrl = 'https://dashboard.datamcp.app/docs/n8n';

  properties: INodeProperties[] = [
    {
      displayName: 'Environment',
      name: 'environment',
      type: 'options',
      options: [
        { name: 'Production', value: 'production' },
        { name: 'QA', value: 'qa' },
      ],
      default: 'production',
    },
    {
      displayName: 'Integration Key',
      name: 'accessToken',
      type: 'string',
      typeOptions: { password: true },
      required: true,
      default: '',
      description:
        'Create a source-scoped key under DataMCP Dashboard → API Keys → Integration credentials. The dm_int_ secret is shown once. Do not use a workspace sk_live_ API key.',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.accessToken}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      url: "={{$credentials.environment === 'qa' ? 'https://api-qa.datamcp.app/api/integrations/v1/sources' : 'https://api.datamcp.app/api/integrations/v1/sources'}}",
      method: 'GET',
    },
  };
}
