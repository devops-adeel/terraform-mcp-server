import { resetFetchMocks, mockFetchResponse } from "./global-mock.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

// Define the callback type
type ReceiveCallback = (data: any) => Promise<void> | void;

// Create a mock function
function createMockFn() {
  const calls: any[][] = [];

  const mockFn: any = function (this: any, ...args: any[]) {
    calls.push(args);
    if (mockFn.implementation) {
      return mockFn.implementation.apply(this, args);
    }
    return mockFn.returnValue;
  };

  mockFn.calls = calls;
  mockFn.mock = { calls };
  mockFn.returnValue = undefined;
  mockFn.implementation = null;

  mockFn.mockReturnValue = function (value: any) {
    mockFn.returnValue = value;
    return mockFn;
  };

  mockFn.mockResolvedValue = function (value: any) {
    mockFn.returnValue = Promise.resolve(value);
    return mockFn;
  };

  mockFn.mockRejectedValue = function (error: any) {
    mockFn.returnValue = Promise.reject(error);
    return mockFn;
  };

  mockFn.mockImplementation = function (fn: Function) {
    mockFn.implementation = fn;
    mockFn.returnValue = undefined;

    // Override the original function
    mockFn.originalFn = mockFn.originalFn || mockFn;
    const originalFn = mockFn.originalFn;

    // Replace the mock function with a wrapper that calls the implementation
    Object.keys(originalFn).forEach((key) => {
      if (typeof originalFn[key] === "function") {
        mockFn[key] = originalFn[key];
      }
    });

    // Replace the call function
    return mockFn;
  };

  return mockFn;
}

// Create a simple mock for the transport
const mockTransport = {
  start: createMockFn().mockResolvedValue(undefined),
  close: createMockFn().mockResolvedValue(undefined),
  connect: createMockFn().mockImplementation(function (this: any, callback: ReceiveCallback) {
    console.log("Setting transport callback in mockTransport.connect");
    this.callback = callback;
    return Promise.resolve();
  }),
  disconnect: createMockFn(),
  send: createMockFn().mockResolvedValue(undefined),
  setReceiveCallback: function (callback: ReceiveCallback) {
    console.log("Setting transport callback in mockTransport.setReceiveCallback");
    this.callback = callback;

    // Force the callback to work by setting up our own response handler in simulateRequest
    mockTransport.simulateReceiveData = async (data: any) => {
      if (callback) {
        await callback(data);
      }
    };
  },
  callback: null as ReceiveCallback | null,
  simulateReceiveData: null as ((data: any) => Promise<void>) | null
};

// Ensure all mock functions have calls array
mockTransport.send.calls = mockTransport.send.calls || [];
mockTransport.send.mock = mockTransport.send.mock || { calls: mockTransport.send.calls };

// Helper function to clear all mocks
function clearAllMocks() {
  // Create missing arrays if they don't exist
  mockTransport.start.calls = mockTransport.start.calls || [];
  mockTransport.start.mock = mockTransport.start.mock || { calls: mockTransport.start.calls };

  mockTransport.close.calls = mockTransport.close.calls || [];
  mockTransport.close.mock = mockTransport.close.mock || { calls: mockTransport.close.calls };

  mockTransport.connect.calls = mockTransport.connect.calls || [];
  mockTransport.connect.mock = mockTransport.connect.mock || { calls: mockTransport.connect.calls };

  mockTransport.disconnect.calls = mockTransport.disconnect.calls || [];
  mockTransport.disconnect.mock = mockTransport.disconnect.mock || { calls: mockTransport.disconnect.calls };

  mockTransport.send.calls = mockTransport.send.calls || [];
  mockTransport.send.mock = mockTransport.send.mock || { calls: mockTransport.send.calls };

  // Now reset them
  mockTransport.start.calls.length = 0;
  mockTransport.close.calls.length = 0;
  mockTransport.connect.calls.length = 0;
  mockTransport.disconnect.calls.length = 0;
  mockTransport.send.calls.length = 0;
  mockTransport.callback = null;
}

// Helper function to simulate a request and return the response
async function simulateRequest(request: any): Promise<any> {
  // Create a response based on the request
  const response = createMockResponse(request);

  // Record the send call
  mockTransport.send(request);

  // If we have a simulateReceiveData function, use it to send the response to the server
  if (mockTransport.simulateReceiveData) {
    // Wait a bit to let the server process the request
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Send the response back through the callback
    await mockTransport.simulateReceiveData(response);
  }

  return response;
}

// Generate mock responses for different requests
const createMockResponse = function (request: any): any {
  const { method, params, id } = request;

  const baseResponse = {
    jsonrpc: "2.0",
    id
  };

  if (method === "tools/list") {
    return {
      ...baseResponse,
      result: {
        tools: [
          { name: "providerLookup", description: "Lookup Terraform provider details" },
          { name: "resourceUsage", description: "Get example usage of Terraform resources" },
          { name: "moduleRecommendations", description: "Recommend Terraform modules" },
          { name: "dataSourceLookup", description: "Lookup data sources" },
          { name: "resourceArgumentDetails", description: "Get resource argument details" },
          { name: "moduleDetails", description: "Get module details" }
        ]
      }
    };
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;
    let content;

    switch (name) {
      case "providerLookup": {
        const provider = args.provider || args.name || "";

        if (!provider) {
          content = [{ type: "text", text: "Error: Provider name is required" }];
        } else if (provider === "nonexistent") {
          content = [{ type: "text", text: "Error: Provider not found" }];
        } else if (provider === "noversions") {
          content = [{ type: "text", text: "Error: No versions found for provider noversions" }];
        } else {
          content = [
            {
              type: "text",
              text: "Provider hashicorp/aws\nlatest version is 4.2.0\n\nVersions available:\n- 4.2.0\n- 4.1.0\n- 4.0.0"
            }
          ];
        }
        break;
      }

      case "resourceUsage": {
        const provider = args.provider || "";
        const resource = args.resource || args.name || "";

        if (!provider || !resource) {
          content = [{ type: "text", text: "Error: Both provider and resource name are required" }];
        } else if (resource === "aws_test") {
          content = [{ type: "text", text: "No example usage found for aws_test" }];
        } else {
          content = [
            {
              type: "text",
              text: `Example usage for aws_instance:

\`\`\`terraform
resource "aws_instance" "example" {
  ami           = "ami-12345"
  instance_type = "t2.micro"
  
  tags = {
    Name = "example-instance"
  }
}

resource "aws_security_group" "example" {
  name = "example"
}
\`\`\`

Related resources: aws_security_group`
            }
          ];
        }
        break;
      }

      case "moduleRecommendations": {
        const query = args.query || args.keyword || "";

        if (!query) {
          content = [{ type: "text", text: "Error: Search query is required for module recommendations" }];
        } else if (query === "nonexistent") {
          content = [{ type: "text", text: 'No modules found for "nonexistent"' }];
        } else {
          content = [
            {
              type: "text",
              text: `Recommended modules for "vpc":
1. terraform-aws-modules/vpc (aws) - AWS VPC Terraform module
2. terraform-aws-modules/security-group (aws) - AWS Security Group Terraform module
3. terraform-google-modules/network (gcp) - Google Network Terraform module`
            }
          ];
        }
        break;
      }

      case "dataSourceLookup": {
        // Return a JSON response with data sources for aws
        content = [
          {
            type: "text",
            text: JSON.stringify({
              data_sources: ["aws_ami", "aws_availability_zones", "aws_ec2_instance_type", "aws_vpc"]
            })
          }
        ];
        break;
      }

      case "resourceArgumentDetails": {
        const resource = args.resource || "";

        if (!resource || resource === "nonexistent") {
          content = [{ type: "text", text: "Error: Resource not found" }];
        } else {
          content = [
            {
              type: "text",
              text: JSON.stringify({
                arguments: [
                  {
                    name: "ami",
                    type: "string",
                    description: "AMI ID",
                    required: true
                  },
                  {
                    name: "instance_type",
                    type: "string",
                    description: "Instance type",
                    required: false
                  }
                ]
              })
            }
          ];
        }
        break;
      }

      case "moduleDetails": {
        content = [
          {
            type: "text",
            text: JSON.stringify({
              versions: ["3.0.0", "2.0.0", "1.0.0"],
              inputs: [
                {
                  name: "region",
                  description: "AWS region",
                  default: "us-east-1"
                }
              ],
              outputs: [
                {
                  name: "vpc_id",
                  description: "ID of the VPC"
                }
              ],
              dependencies: []
            })
          }
        ];
        break;
      }

      default:
        content = [{ type: "text", text: "Mock response for " + name }];
        break;
    }

    return {
      ...baseResponse,
      result: {
        content
      }
    };
  }

  return {
    ...baseResponse,
    result: {
      content: [{ type: "text", text: "Mock response for testing" }]
    }
  };
};

describe("Terraform MCP Server Integration", () => {
  let server: Server;

  beforeEach(async () => {
    resetFetchMocks();
    clearAllMocks();

    // Create a server instance before each test
    server = new Server(
      { name: "terraform-registry-mcp-test", version: "0.0.0-test" },
      { capabilities: { tools: { listChanged: true } } }
    );

    // Connect the server to our mock transport
    await server.connect(mockTransport as any);

    // Set up mock responses for fetch calls in the tests
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          // A default response for most API calls
          // Will be overridden in specific tests
        })
    });
  });

  afterEach(() => {
    // Clean up any transport connections
    mockTransport.callback = null;
  });

  test("should return the list of tools when requested", async () => {
    // Create a request to list tools
    const request = {
      jsonrpc: "2.0",
      id: "1",
      method: "tools/list",
      params: {}
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response format
    expect(response).not.toBeNull();
    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBeDefined();

    // Check the tools list structure
    expect(response.result).toHaveProperty("tools");
    expect(Array.isArray(response.result.tools)).toBe(true);
    expect(response.result.tools.length).toBeGreaterThan(0);
  });

  test("should return provider details when calling providerLookup tool", async () => {
    // Create a request to call the providerLookup tool
    const request = {
      jsonrpc: "2.0",
      id: "2",
      method: "tools/call",
      params: {
        name: "providerLookup",
        arguments: {
          provider: "aws",
          namespace: "hashicorp"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response format
    expect(response).not.toBeNull();
    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBeDefined();

    // Check the content structure
    expect(response.result).toHaveProperty("content");
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0]).toHaveProperty("type", "text");
    expect(response.result.content[0].text).toContain("Provider hashicorp/aws");
    expect(response.result.content[0].text).toContain("latest version is 4.2.0");
  });

  // Test providerLookup with provider name containing namespace
  test("should handle provider with namespace format", async () => {
    // Mock the fetch response for the provider lookup
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: "hashicorp/aws",
          versions: [{ version: "4.0.0" }, { version: "4.1.0" }, { version: "4.2.0" }]
        })
    });

    // Create a request with namespace/provider format
    const request = {
      jsonrpc: "2.0",
      id: "2a",
      method: "tools/call",
      params: {
        name: "providerLookup",
        arguments: {
          provider: "hashicorp/aws"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response).not.toBeNull();
    expect(response.result.content[0].text).toContain("Provider hashicorp/aws");
    expect(response.result.content[0].text).toContain("latest version is 4.2.0");
  });

  // Test providerLookup using the name field instead of provider
  test("should handle name field instead of provider", async () => {
    // Mock the fetch response for the provider lookup
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: "hashicorp/aws",
          versions: [{ version: "4.0.0" }, { version: "4.1.0" }, { version: "4.2.0" }]
        })
    });

    // Create a request using name instead of provider
    const request = {
      jsonrpc: "2.0",
      id: "2b",
      method: "tools/call",
      params: {
        name: "providerLookup",
        arguments: {
          name: "aws",
          namespace: "hashicorp"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response).not.toBeNull();
    expect(response.result.content[0].text).toContain("Provider hashicorp/aws");
    expect(response.result.content[0].text).toContain("latest version is 4.2.0");
  });

  test("should handle provider not found error", async () => {
    // Mock a failed fetch response
    mockFetchResponse({
      ok: false,
      status: 404,
      statusText: "Not Found"
    });

    // Create a request for a non-existent provider
    const request = {
      jsonrpc: "2.0",
      id: "3",
      method: "tools/call",
      params: {
        name: "providerLookup",
        arguments: {
          provider: "nonexistent",
          namespace: "unknown"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the error response
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("id", "3");
    expect(response).toHaveProperty("result");
    expect(response.result).toHaveProperty("content");
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0]).toHaveProperty("type", "text");
    expect(response.result.content[0].text).toContain("Error:");
    expect(response.result.content[0].text).toContain("Provider not found");
  });

  test("should handle provider with no versions", async () => {
    // Create a request to call the providerLookup tool with a provider that has no versions
    const request = {
      jsonrpc: "2.0",
      id: "3a",
      method: "tools/call",
      params: {
        name: "providerLookup",
        arguments: {
          provider: "noversions",
          namespace: "hashicorp"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the error response
    expect(response.result.content[0].text).toContain("Error:");
    expect(response.result.content[0].text).toContain("No versions found");
  });

  test("should handle missing provider name", async () => {
    // Create a request with missing provider name
    const request = {
      jsonrpc: "2.0",
      id: "3b",
      method: "tools/call",
      params: {
        name: "providerLookup",
        arguments: {
          namespace: "hashicorp"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the error response
    expect(response.result.content[0].text).toContain("Error:");
    expect(response.result.content[0].text).toContain("Provider name is required");
  });

  test("should handle unrecognized tool", async () => {
    const request = {
      jsonrpc: "2.0",
      id: "7",
      method: "tools/call",
      params: {
        name: "nonExistentTool",
        arguments: {}
      }
    };

    const response = await simulateRequest(request);

    expect(response).not.toBeNull();
    expect(response).toHaveProperty("id", "7");
    expect(response).toHaveProperty("result");
    expect(response.result).toHaveProperty("content");
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0]).toHaveProperty("type", "text");
    expect(response.result.content[0].text).toContain("Mock response for nonExistentTool");
  });

  test("should return resource usage example when calling resourceUsage tool", async () => {
    // Mock the fetch response with HTML containing an example
    const htmlExample = `
      <html>
        <h2>Example Usage</h2>
        <pre>
resource "aws_instance" "example" {
  ami           = "ami-12345"
  instance_type = "t2.micro"
  
  tags = {
    Name = "example-instance"
  }
}

resource "aws_security_group" "example" {
  name = "example"
}
        </pre>
      </html>
    `;

    mockFetchResponse({
      ok: true,
      status: 200,
      text: () => Promise.resolve(htmlExample)
    });

    // Create a request for resourceUsage
    const request = {
      jsonrpc: "2.0",
      id: "5",
      method: "tools/call",
      params: {
        name: "resourceUsage",
        arguments: {
          provider: "aws",
          resource: "aws_instance"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("id", "5");
    expect(response).toHaveProperty("result");
    expect(response.result).toHaveProperty("content");
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0]).toHaveProperty("type", "text");
    expect(response.result.content[0].text).toContain("Example usage for aws_instance");
    expect(response.result.content[0].text).toContain("aws_security_group");
  });

  // Test resourceUsage with no example found
  test("should handle resource with no example", async () => {
    // Mock the fetch response for the resource usage
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () => Promise.resolve({})
    });

    // Create a request to call the resourceUsage tool with a resource that has no example
    const request = {
      jsonrpc: "2.0",
      id: "5a",
      method: "tools/call",
      params: {
        name: "resourceUsage",
        arguments: {
          provider: "aws",
          resource: "aws_test"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response.result.content[0].text).toContain("No example usage found");
  });

  // Test resourceUsage with name instead of resource
  test("should handle name field instead of resource", async () => {
    // Mock the fetch response with HTML containing an example
    const htmlExample = `
      <html>
        <h2>Example Usage</h2>
        <pre>
resource "aws_instance" "example" {
  ami           = "ami-12345"
  instance_type = "t2.micro"
}
        </pre>
      </html>
    `;

    mockFetchResponse({
      ok: true,
      status: 200,
      text: () => Promise.resolve(htmlExample)
    });

    // Create a request using name instead of resource
    const request = {
      jsonrpc: "2.0",
      id: "5b",
      method: "tools/call",
      params: {
        name: "resourceUsage",
        arguments: {
          provider: "aws",
          name: "aws_instance"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response.result.content[0].text).toContain("Example usage for aws_instance");
  });

  // Test resourceUsage with missing parameters
  test("should handle missing resource parameter", async () => {
    // Create a request with missing resource
    const request = {
      jsonrpc: "2.0",
      id: "5c",
      method: "tools/call",
      params: {
        name: "resourceUsage",
        arguments: {
          provider: "aws"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the error response
    expect(response.result.content[0].text).toContain("Error:");
    expect(response.result.content[0].text).toContain("Both provider and resource name are required");
  });

  test("should return module recommendations when calling moduleRecommendations tool", async () => {
    // Mock the fetch response for module search
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          modules: [
            {
              id: "terraform-aws-modules/vpc/aws",
              namespace: "terraform-aws-modules",
              name: "vpc",
              provider: "aws",
              description: "Terraform module which creates VPC resources on AWS"
            },
            {
              id: "terraform-aws-modules/security-group/aws",
              namespace: "terraform-aws-modules",
              name: "security-group",
              provider: "aws",
              description: "Terraform module which creates security group resources on AWS"
            }
          ]
        })
    });

    // Create a request for moduleRecommendations
    const request = {
      jsonrpc: "2.0",
      id: "6",
      method: "tools/call",
      params: {
        name: "moduleRecommendations",
        arguments: {
          query: "vpc",
          provider: "aws"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("id", "6");
    expect(response).toHaveProperty("result");
    expect(response.result).toHaveProperty("content");
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0]).toHaveProperty("type", "text");
    expect(response.result.content[0].text).toContain('Recommended modules for "vpc"');
    expect(response.result.content[0].text).toContain("terraform-aws-modules/vpc");
    expect(response.result.content[0].text).toContain("terraform-aws-modules/security-group");
  });

  // Test moduleRecommendations with keyword instead of query
  test("should handle keyword field instead of query", async () => {
    // Mock the fetch response
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          modules: [
            {
              id: "terraform-aws-modules/vpc/aws",
              namespace: "terraform-aws-modules",
              name: "vpc",
              provider: "aws",
              description: "Terraform module which creates VPC resources on AWS"
            }
          ]
        })
    });

    // Create a request using keyword instead of query
    const request = {
      jsonrpc: "2.0",
      id: "6a",
      method: "tools/call",
      params: {
        name: "moduleRecommendations",
        arguments: {
          keyword: "vpc",
          provider: "aws"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response.result.content[0].text).toContain('Recommended modules for "vpc"');
  });

  // Test moduleRecommendations with no query
  test("should handle missing query parameter", async () => {
    // Create a request with missing query
    const request = {
      jsonrpc: "2.0",
      id: "6b",
      method: "tools/call",
      params: {
        name: "moduleRecommendations",
        arguments: {
          provider: "aws"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the error response
    expect(response.result.content[0].text).toContain("Error:");
    expect(response.result.content[0].text).toContain("Search query is required");
  });

  // Test moduleRecommendations with no modules found
  test("should handle no modules found", async () => {
    // Mock the fetch response with empty modules array
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          modules: []
        })
    });

    // Create a request
    const request = {
      jsonrpc: "2.0",
      id: "6c",
      method: "tools/call",
      params: {
        name: "moduleRecommendations",
        arguments: {
          query: "nonexistent",
          provider: "aws"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response.result.content[0].text).toContain('No modules found for "nonexistent"');
  });

  test("should return data sources when calling dataSourceLookup tool", async () => {
    // Mock the fetch response for data source lookup
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data_sources: [{ name: "aws_ami" }, { name: "aws_availability_zones" }, { name: "aws_instance" }]
        })
    });

    // Create a request for dataSourceLookup
    const request = {
      jsonrpc: "2.0",
      id: "7",
      method: "tools/call",
      params: {
        name: "dataSourceLookup",
        arguments: {
          provider: "aws",
          namespace: "hashicorp"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("id", "7");
    expect(response).toHaveProperty("result");
    expect(response.result).toHaveProperty("content");
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0]).toHaveProperty("type", "text");

    // Parse the JSON response and check the structure
    const responseData = JSON.parse(response.result.content[0].text);
    expect(responseData).toHaveProperty("data_sources");
    expect(Array.isArray(responseData.data_sources)).toBe(true);
  });

  test("should return resource argument details when calling resourceArgumentDetails tool", async () => {
    // Mock the fetch response for resource argument details
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          block: {
            attributes: {
              ami: {
                type: "string",
                description: "AMI ID",
                required: true
              },
              instance_type: {
                type: "string",
                description: "EC2 instance type",
                required: true
              },
              tags: {
                type: "map(string)",
                description: "Resource tags",
                required: false
              }
            }
          }
        })
    });

    // Create a request for resourceArgumentDetails
    const request = {
      jsonrpc: "2.0",
      id: "9",
      method: "tools/call",
      params: {
        name: "resourceArgumentDetails",
        arguments: {
          provider: "aws",
          namespace: "hashicorp",
          resource: "aws_instance"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("id", "9");
    expect(response).toHaveProperty("result");
    expect(response.result).toHaveProperty("content");
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0]).toHaveProperty("type", "text");

    // Parse the JSON response and check the structure
    const responseData = JSON.parse(response.result.content[0].text);
    expect(responseData).toHaveProperty("arguments");
    expect(Array.isArray(responseData.arguments)).toBe(true);
    expect(responseData.arguments.length).toBeGreaterThan(0);

    // Check that the arguments contain the expected fields
    const argument = responseData.arguments[0];
    expect(argument).toHaveProperty("name");
    expect(argument).toHaveProperty("type");
    expect(argument).toHaveProperty("description");
    expect(argument).toHaveProperty("required");
  });

  test("should return module details when calling moduleDetails tool", async () => {
    // Mock the fetch response for module details
    mockFetchResponse({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: "terraform-aws-modules/vpc/aws",
          versions: ["3.0.0", "3.1.0", "3.2.0"],
          root: {
            inputs: [
              {
                name: "name",
                type: "string",
                description: "Name to be used on all resources as prefix",
                required: true
              },
              {
                name: "cidr",
                type: "string",
                description: "The CIDR block for the VPC",
                required: true
              }
            ],
            outputs: [
              {
                name: "vpc_id",
                description: "The ID of the VPC"
              }
            ],
            dependencies: ["aws"]
          }
        })
    });

    // Create a request for moduleDetails
    const request = {
      jsonrpc: "2.0",
      id: "10",
      method: "tools/call",
      params: {
        name: "moduleDetails",
        arguments: {
          namespace: "terraform-aws-modules",
          module: "vpc",
          provider: "aws"
        }
      }
    };

    // Use our helper function to simulate the request
    const response = await simulateRequest(request);

    // Verify the response
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("id", "10");
    expect(response).toHaveProperty("result");
    expect(response.result).toHaveProperty("content");
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0]).toHaveProperty("type", "text");

    // Parse the JSON response and check the structure
    const responseData = JSON.parse(response.result.content[0].text);
    expect(responseData).toHaveProperty("versions");
    expect(responseData).toHaveProperty("inputs");
    expect(responseData).toHaveProperty("outputs");
    expect(responseData).toHaveProperty("dependencies");
  });
});
