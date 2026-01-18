import { BaseClient } from "../client/baseClient";
import { TestdataRequest, TestdataResponse } from "../types/testdata";

export class TestdataClient extends BaseClient {
  async enableAttachments(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/attachment", request);
  }

  async revokeAttachments(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/attachment/revoke", request);
  }

  async grantPermissions(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/permissions", request);
  }

  async revokePermissions(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/permissions/revoke", request);
  }

  async createPerson(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/person", request);
  }

  async removePerson(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/person/remove", request);
  }

  async createSubject(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/subject", request);
  }

  async removeSubject(request: TestdataRequest): Promise<TestdataResponse> {
    return this.post("/testdata/subject/remove", request);
  }

  private async post(path: string, body: TestdataRequest): Promise<TestdataResponse> {
    const token = await this.getAccessToken();
    return this.http.request<TestdataResponse>({
      method: "POST",
      path,
      body,
      authToken: token,
    });
  }
}
