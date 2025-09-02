// UserRegistry.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface UserData {
  role: string;
  verified: boolean;
  banned: boolean;
  name: string;
  bio: string;
  registrationTime: number;
}

interface ExpertData {
  specialty: string;
  ratingSum: number;
  ratingCount: number;
  certifications: string[];
}

interface BanData {
  reason: string;
  banTime: number;
  bannedBy: string;
}

interface ContractState {
  users: Map<string, UserData>;
  experts: Map<string, ExpertData>;
  userPermissions: Map<string, boolean>; // Key as `${user}|${permission}`
  bans: Map<string, BanData>;
  admin: string;
  verifier: string;
  blockHeight: number;
}

// Mock contract implementation
class UserRegistryMock {
  private state: ContractState = {
    users: new Map(),
    experts: new Map(),
    userPermissions: new Map(),
    bans: new Map(),
    admin: "deployer",
    verifier: "deployer",
    blockHeight: 0,
  };

  private ERR_UNAUTHORIZED = 100;
  private ERR_ALREADY_REGISTERED = 101;
  private ERR_INVALID_ROLE = 102;
  private ERR_NOT_VERIFIED = 103;
  private ERR_BANNED = 104;
  private ERR_INVALID_RATING = 105;
  private ERR_INVALID_PERMISSION = 106;
  private ERR_ALREADY_BANNED = 107;
  private ERR_NOT_BANNED = 108;
  private ERR_INVALID_DETAILS = 109;
  private MAX_NAME_LEN = 50;
  private MAX_BIO_LEN = 500;
  private MAX_SPECIALTY_LEN = 64;
  private MAX_CERT_LEN = 200;
  private MAX_PERMS = 5;

  private incrementBlockHeight() {
    this.state.blockHeight += 1;
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setVerifier(caller: string, newVerifier: string): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.verifier = newVerifier;
    return { ok: true, value: true };
  }

  registerUser(caller: string, role: string, name: string, bio: string): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (!["patient", "client"].includes(role)) {
      return { ok: false, value: this.ERR_INVALID_ROLE };
    }
    if (this.state.users.has(caller)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    if (name.length > this.MAX_NAME_LEN || bio.length > this.MAX_BIO_LEN) {
      return { ok: false, value: this.ERR_INVALID_DETAILS };
    }
    this.state.users.set(caller, {
      role,
      verified: false,
      banned: false,
      name,
      bio,
      registrationTime: this.state.blockHeight,
    });
    return { ok: true, value: true };
  }

  registerExpert(caller: string, specialty: string, name: string, bio: string, certs: string[]): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (this.state.users.has(caller)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    if (specialty.length > this.MAX_SPECIALTY_LEN || name.length > this.MAX_NAME_LEN || bio.length > this.MAX_BIO_LEN) {
      return { ok: false, value: this.ERR_INVALID_DETAILS };
    }
    this.state.users.set(caller, {
      role: "expert",
      verified: false,
      banned: false,
      name,
      bio,
      registrationTime: this.state.blockHeight,
    });
    this.state.experts.set(caller, {
      specialty,
      ratingSum: 0,
      ratingCount: 0,
      certifications: certs,
    });
    return { ok: true, value: true };
  }

  verifyUser(caller: string, user: string): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (caller !== this.state.verifier) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const userData = this.state.users.get(user);
    if (!userData) {
      return { ok: false, value: this.ERR_INVALID_ROLE };
    }
    if (userData.verified) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    userData.verified = true;
    this.state.users.set(user, userData);
    return { ok: true, value: true };
  }

  updateProfile(caller: string, name: string, bio: string): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    const userData = this.state.users.get(caller);
    if (!userData) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (userData.banned) {
      return { ok: false, value: this.ERR_BANNED };
    }
    if (name.length > this.MAX_NAME_LEN || bio.length > this.MAX_BIO_LEN) {
      return { ok: false, value: this.ERR_INVALID_DETAILS };
    }
    userData.name = name;
    userData.bio = bio;
    this.state.users.set(caller, userData);
    return { ok: true, value: true };
  }

  updateExpertDetails(caller: string, specialty: string, certs: string[]): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    const userData = this.state.users.get(caller);
    if (!userData) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const expertData = this.state.experts.get(caller);
    if (!expertData || userData.role !== "expert") {
      return { ok: false, value: this.ERR_INVALID_ROLE };
    }
    if (userData.banned) {
      return { ok: false, value: this.ERR_BANNED };
    }
    if (specialty.length > this.MAX_SPECIALTY_LEN) {
      return { ok: false, value: this.ERR_INVALID_DETAILS };
    }
    expertData.specialty = specialty;
    expertData.certifications = certs;
    this.state.experts.set(caller, expertData);
    return { ok: true, value: true };
  }

  addRating(caller: string, expert: string, rating: number): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    const expertData = this.state.experts.get(expert);
    if (!expertData) {
      return { ok: false, value: this.ERR_INVALID_ROLE };
    }
    const userData = this.state.users.get(caller);
    if (!userData) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (!userData.verified) {
      return { ok: false, value: this.ERR_NOT_VERIFIED };
    }
    if (rating < 1 || rating > 5) {
      return { ok: false, value: this.ERR_INVALID_RATING };
    }
    expertData.ratingSum += rating;
    expertData.ratingCount += 1;
    this.state.experts.set(expert, expertData);
    return { ok: true, value: true };
  }

  grantPermission(caller: string, user: string, permission: string): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const key = `${user}|${permission}`;
    this.state.userPermissions.set(key, true);
    return { ok: true, value: true };
  }

  revokePermission(caller: string, user: string, permission: string): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const key = `${user}|${permission}`;
    this.state.userPermissions.delete(key);
    return { ok: true, value: true };
  }

  banUser(caller: string, user: string, reason: string): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const userData = this.state.users.get(user);
    if (!userData) {
      return { ok: false, value: this.ERR_INVALID_ROLE };
    }
    if (userData.banned) {
      return { ok: false, value: this.ERR_ALREADY_BANNED };
    }
    userData.banned = true;
    this.state.users.set(user, userData);
    this.state.bans.set(user, {
      reason,
      banTime: this.state.blockHeight,
      bannedBy: caller,
    });
    return { ok: true, value: true };
  }

  unbanUser(caller: string, user: string): ClarityResponse<boolean> {
    this.incrementBlockHeight();
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const userData = this.state.users.get(user);
    if (!userData) {
      return { ok: false, value: this.ERR_INVALID_ROLE };
    }
    if (!userData.banned) {
      return { ok: false, value: this.ERR_NOT_BANNED };
    }
    userData.banned = false;
    this.state.users.set(user, userData);
    this.state.bans.delete(user);
    return { ok: true, value: true };
  }

  getUserDetails(user: string): ClarityResponse<UserData | null> {
    return { ok: true, value: this.state.users.get(user) ?? null };
  }

  getExpertDetails(expert: string): ClarityResponse<ExpertData | null> {
    return { ok: true, value: this.state.experts.get(expert) ?? null };
  }

  getAverageRating(expert: string): ClarityResponse<number> {
    const expertData = this.state.experts.get(expert);
    if (!expertData) {
      return { ok: false, value: this.ERR_INVALID_ROLE };
    }
    if (expertData.ratingCount > 0) {
      return { ok: true, value: Math.floor(expertData.ratingSum / expertData.ratingCount) };
    }
    return { ok: true, value: 0 };
  }

  hasPermission(user: string, permission: string): ClarityResponse<boolean> {
    const key = `${user}|${permission}`;
    return { ok: true, value: this.state.userPermissions.get(key) ?? false };
  }

  getBanDetails(user: string): ClarityResponse<BanData | null> {
    return { ok: true, value: this.state.bans.get(user) ?? null };
  }

  isVerified(user: string): ClarityResponse<boolean> {
    const userData = this.state.users.get(user);
    return { ok: true, value: userData ? userData.verified : false };
  }

  isBanned(user: string): ClarityResponse<boolean> {
    const userData = this.state.users.get(user);
    return { ok: true, value: userData ? userData.banned : false };
  }

  getUserRole(user: string): ClarityResponse<string | null> {
    const userData = this.state.users.get(user);
    return { ok: true, value: userData ? userData.role : null };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  getVerifier(): ClarityResponse<string> {
    return { ok: true, value: this.state.verifier };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  verifier: "verifier",
  patient: "patient1",
  expert: "expert1",
  user: "user1",
};

describe("UserRegistry Contract", () => {
  let contract: UserRegistryMock;

  beforeEach(() => {
    contract = new UserRegistryMock();
  });

  it("should allow admin to set new admin", () => {
    const result = contract.setAdmin(accounts.deployer, accounts.verifier);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getAdmin()).toEqual({ ok: true, value: accounts.verifier });
  });

  it("should prevent non-admin from setting admin", () => {
    const result = contract.setAdmin(accounts.patient, accounts.verifier);
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should allow admin to set verifier", () => {
    const result = contract.setVerifier(accounts.deployer, accounts.verifier);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getVerifier()).toEqual({ ok: true, value: accounts.verifier });
  });

  it("should register a user successfully", () => {
    const result = contract.registerUser(accounts.patient, "patient", "John Doe", "Bio here");
    expect(result).toEqual({ ok: true, value: true });
    const details = contract.getUserDetails(accounts.patient);
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({
        role: "patient",
        verified: false,
        banned: false,
        name: "John Doe",
        bio: "Bio here",
      }),
    });
  });

  it("should prevent duplicate user registration", () => {
    contract.registerUser(accounts.patient, "patient", "John Doe", "Bio here");
    const result = contract.registerUser(accounts.patient, "patient", "John Doe", "Bio here");
    expect(result).toEqual({ ok: false, value: 101 });
  });

  it("should register an expert successfully", () => {
    const result = contract.registerExpert(accounts.expert, "Cardiology", "Dr. Smith", "Expert bio", ["Cert1", "Cert2"]);
    expect(result).toEqual({ ok: true, value: true });
    const userDetails = contract.getUserDetails(accounts.expert);
    expect(userDetails).toEqual({
      ok: true,
      value: expect.objectContaining({ role: "expert" }),
    });
    const expertDetails = contract.getExpertDetails(accounts.expert);
    expect(expertDetails).toEqual({
      ok: true,
      value: expect.objectContaining({
        specialty: "Cardiology",
        certifications: ["Cert1", "Cert2"],
      }),
    });
  });

  it("should allow verifier to verify user", () => {
    contract.registerUser(accounts.patient, "patient", "John Doe", "Bio here");
    contract.setVerifier(accounts.deployer, accounts.verifier);
    const result = contract.verifyUser(accounts.verifier, accounts.patient);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.isVerified(accounts.patient)).toEqual({ ok: true, value: true });
  });

  it("should prevent non-verifier from verifying", () => {
    contract.registerUser(accounts.patient, "patient", "John Doe", "Bio here");
    const result = contract.verifyUser(accounts.patient, accounts.patient);
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should update user profile", () => {
    contract.registerUser(accounts.patient, "patient", "John Doe", "Bio here");
    const result = contract.updateProfile(accounts.patient, "New Name", "New Bio");
    expect(result).toEqual({ ok: true, value: true });
    const details = contract.getUserDetails(accounts.patient);
    expect(details.ok).toBe(true);
    expect(details.value).not.toBeNull();
    if (details.ok && details.value !== null && typeof details.value !== "number") {
      expect(details.value.name).toBe("New Name");
      expect(details.value.bio).toBe("New Bio");
    }
  });

  it("should add rating to expert", () => {
    contract.registerExpert(accounts.expert, "Cardiology", "Dr. Smith", "Expert bio", []);
    contract.registerUser(accounts.patient, "patient", "John Doe", "Bio here");
    contract.verifyUser(accounts.deployer, accounts.patient); // Assuming deployer is verifier
    const result = contract.addRating(accounts.patient, accounts.expert, 4);
    expect(result).toEqual({ ok: true, value: true });
    const avg = contract.getAverageRating(accounts.expert);
    expect(avg).toEqual({ ok: true, value: 4 });
  });

  it("should grant and revoke permission", () => {
    contract.registerUser(accounts.user, "patient", "User", "Bio");
    const grant = contract.grantPermission(accounts.deployer, accounts.user, "admin-access");
    expect(grant).toEqual({ ok: true, value: true });
    expect(contract.hasPermission(accounts.user, "admin-access")).toEqual({ ok: true, value: true });

    const revoke = contract.revokePermission(accounts.deployer, accounts.user, "admin-access");
    expect(revoke).toEqual({ ok: true, value: true });
    expect(contract.hasPermission(accounts.user, "admin-access")).toEqual({ ok: true, value: false });
  });

  it("should ban and unban user", () => {
    contract.registerUser(accounts.user, "patient", "User", "Bio");
    const ban = contract.banUser(accounts.deployer, accounts.user, "Violation");
    expect(ban).toEqual({ ok: true, value: true });
    expect(contract.isBanned(accounts.user)).toEqual({ ok: true, value: true });

    const unban = contract.unbanUser(accounts.deployer, accounts.user);
    expect(unban).toEqual({ ok: true, value: true });
    expect(contract.isBanned(accounts.user)).toEqual({ ok: true, value: false });
  });

  it("should prevent banned user from updating profile", () => {
    contract.registerUser(accounts.user, "patient", "User", "Bio");
    contract.banUser(accounts.deployer, accounts.user, "Violation");
    const update = contract.updateProfile(accounts.user, "New", "New Bio");
    expect(update).toEqual({ ok: false, value: 104 });
  });
});