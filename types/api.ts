// Shared request/response contracts for app/api routes.
// M1+ phase kickoffs append to this file rather than redefining types
// elsewhere — see the M1~M4 parallel-track plan.

import type { Household, Member } from "@/types/domain";

export interface CreateHouseholdRequest {
  name: string;
}

export interface CreateHouseholdResponse {
  household: Household;
  member: Member;
}

export interface HouseholdMembersResponse {
  members: Member[];
}
