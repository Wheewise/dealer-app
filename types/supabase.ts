/**
 * Database types for supabase-js.
 *
 * Kept in step with `supabase/schema.sql` by hand. `npm run db:types`
 * regenerates this from a linked project and is the source of truth once you
 * have one — until then, edit both files together.
 *
 * Two shapes worth knowing before reading a row:
 *   - timestamps arrive as ISO strings, not Date objects (PostgREST is JSON).
 *     `lib/db.ts` exports `toDate` for the conversion.
 *   - numeric(12,2) arrives as a JS number; Prisma used to hand back Decimal.
 */

export type Role = "BUYER" | "DEALER" | "ADMIN" | "SUPER_ADMIN";
export type DealerStatus = "ACTIVE" | "SUSPENDED";
export type VehicleType = "CAR" | "BIKE";
export type VehicleCondition = "A" | "B" | "C";
export type FuelType = "PETROL" | "DIESEL" | "CNG" | "ELECTRIC" | "HYBRID";
export type Transmission = "MANUAL" | "AUTOMATIC" | "AMT" | "CVT";
export type ListingStatus = "ACTIVE" | "PAUSED" | "SOLD";
export type EnquirySource = "FORM" | "WHATSAPP" | "CALL";
export type EnquiryStatus = "OPEN" | "REPLIED" | "CLOSED";
export type TestDriveStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
export type RCTransferStatus =
  | "INITIATED"
  | "DOCS_PENDING"
  | "RTO_PENDING"
  | "RTO_APPROVED"
  | "COMPLETED"
  | "CANCELLED";
export type PayoutStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";
export type InspectorStatus = "PENDING" | "APPROVED" | "REJECTED";
export type InspectionStatus =
  | "REQUESTED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";
export type Community = "BUYER" | "DEALER";
export type NBFC =
  | "BAJAJ_FINSERV"
  | "HDFC_BANK"
  | "ICICI_BANK"
  | "MAHINDRA_FINANCE"
  | "KOTAK_MAHINDRA"
  | "CHOLAMANDALAM"
  | "SHRIRAM_FINANCE"
  | "SUNDARAM_FINANCE"
  | "TATA_CAPITAL"
  | "OTHER";
export type LoanStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "DISBURSED";
export type TemplateType = "EMAIL" | "SMS";
export type PlanTier = "FREE_TRIAL" | "MONTHLY" | "YEARLY";
export type SubStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
export type PaymentKind = "BOOST" | "SUBSCRIPTION" | "WEBHOOK";
export type PaymentStatus = "SUCCEEDED" | "FAILED" | "REFUNDED";

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

/**
 * Every row shape below is a `type`, never an `interface`.
 *
 * postgrest-js constrains a table's Row to `Record<string, unknown>`, and an
 * interface has no implicit index signature — so declaring one as an interface
 * silently fails that constraint and every `.select()` in the codebase infers
 * its rows as `never`, which surfaces as hundreds of "property does not exist"
 * errors far from the cause. Type aliases do get the implicit index signature.
 */

/**
 * One foreign key, in the shape postgrest-js reads to resolve an embed.
 *
 * `Name` must be the constraint name from supabase/schema.sql — that is what a
 * disambiguating select like `User!RCTransfer_sellerId_fkey(...)` matches on.
 * `OneToOne` is true when the FK column is unique, which is what makes the
 * embed type an object instead of an array (in both directions).
 */
type Rel<
  Name extends string,
  Column extends string,
  To extends string,
  OneToOne extends boolean = false,
> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: OneToOne;
  referencedRelation: To;
  referencedColumns: ["id"];
};

/**
 * `Generated` marks a column the database fills in — a default, or a trigger.
 * It is required on Row, optional on Insert. Writing the boilerplate this way
 * rather than three literal shapes per table keeps Row and Insert from drifting.
 *
 * `Relationships` lists this table's own foreign keys. Leaving it empty is not
 * harmless: every embedded select through it degrades to
 * `SelectQueryError<"could not find the relation between …">`.
 */
type Table<
  Row,
  Generated extends keyof Row = never,
  Relationships extends readonly unknown[] = [],
> = {
  Row: Row;
  Insert: Omit<Row, Generated> & Partial<Pick<Row, Generated>>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export type UserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  name: string | null;
  district: string | null;
  state: string | null;
  role: Role;
  authId: string | null;
  emailVerified: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DealerRow = {
  id: string;
  userId: string;
  businessName: string;
  city: string;
  phone: string;
  whatsapp: string | null;
  gstin: string | null;
  gstVerified: boolean;
  status: DealerStatus;
  createdAt: string;
  updatedAt: string;
}

export type StoreRow = {
  id: string;
  dealerId: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  primaryColor: string;
  createdAt: string;
  updatedAt: string;
}

export type ListingRow = {
  id: string;
  dealerId: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number;
  fuelType: FuelType;
  transmission: Transmission | null;
  odometerKm: number;
  askingPrice: number;
  condition: VehicleCondition | null;
  testDriveAvailable: boolean;
  description: string | null;
  city: string;
  status: ListingStatus;
  viewCount: number;
  enquiryCount: number;
  isBoosted: boolean;
  boostExpiresAt: string | null;
  insuranceProvider: string | null;
  insuranceExpiry: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ListingViewRow = {
  id: string;
  listingId: string;
  visitorId: string;
  createdAt: string;
}

export type ListingPhotoRow = {
  id: string;
  listingId: string;
  url: string;
  sortOrder: number;
}

export type Listing360PhotoRow = {
  id: string;
  listingId: string;
  url: string;
  angle: number;
  createdAt: string;
}

export type EnquiryRow = {
  id: string;
  listingId: string;
  dealerId: string;
  buyerId: string | null;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  message: string | null;
  source: EnquirySource;
  priority: number;
  isRead: boolean;
  isContacted: boolean;
  status: EnquiryStatus;
  createdAt: string;
  updatedAt: string;
}

export type TestDriveRow = {
  id: string;
  listingId: string;
  dealerId: string;
  buyerId: string;
  scheduledAt: string;
  status: TestDriveStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RCTransferRow = {
  id: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  registrationNo: string;
  vehicleName: string;
  saleAmount: number;
  status: RCTransferStatus;
  currentStep: number;
  notes: string | null;
  sellerAgreed: boolean;
  buyerAgreed: boolean;
  docsSubmitted: boolean;
  rtoPending: boolean;
  rtoApproved: boolean;
  transferComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RCDocumentRow = {
  id: string;
  transferId: string;
  name: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
}

export type ConversationRow = {
  id: string;
  listingId: string;
  buyerId: string;
  dealerId: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export type SavedListingRow = {
  id: string;
  userId: string;
  listingId: string;
  createdAt: string;
}

export type ApiKeyRow = {
  id: string;
  dealerId: string;
  name: string;
  key: string | null;
  keyHash: string | null;
  keyPrefix: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export type PayoutRow = {
  id: string;
  dealerId: string;
  amount: number;
  status: PayoutStatus;
  razorpayPayoutId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InspectorRow = {
  id: string;
  userId: string;
  certification: string | null;
  status: InspectorStatus;
  createdAt: string;
}

export type InspectionRow = {
  id: string;
  listingId: string;
  inspectorId: string | null;
  dealerId: string;
  status: InspectionStatus;
  checklist: Json | null;
  overallScore: number | null;
  notes: string | null;
  reportUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type PostRow = {
  id: string;
  title: string;
  body: string;
  authorId: string;
  community: Community;
  tags: string[];
  isPinned: boolean;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReplyRow = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export type PostUpvoteRow = {
  id: string;
  postId: string;
  userId: string;
}

export type LoanApplicationRow = {
  id: string;
  listingId: string;
  buyerId: string;
  nbfc: NBFC;
  amount: number;
  tenureMonths: number;
  monthlyEmi: number;
  status: LoanStatus;
  applicantName: string;
  applicantPhone: string;
  applicantPan: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationTemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: TemplateType;
  updatedAt: string;
}

export type SubscriptionRow = {
  id: string;
  dealerId: string;
  plan: PlanTier;
  status: SubStatus;
  razorpaySubId: string | null;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentRow = {
  id: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpayEventId: string | null;
  razorpaySignature: string | null;
  kind: PaymentKind;
  amount: number;
  currency: string;
  status: PaymentStatus;
  notes: Json | null;
  dealerId: string | null;
  listingId: string | null;
  createdAt: string;
}

export type AccountRow = {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  session_state: string | null;
}

export type SessionRow = {
  id: string;
  sessionToken: string;
  userId: string;
  expires: string;
}

export type VerificationTokenRow = {
  identifier: string;
  token: string;
  expires: string;
}

type Timestamps = "id" | "createdAt" | "updatedAt";

export interface Database {
  public: {
    Tables: {
      User: Table<
        UserRow,
        Timestamps | "email" | "phone" | "passwordHash" | "name" | "district" | "state" | "role" | "authId" | "emailVerified"
      >;
      Account: Table<
        AccountRow,
        | "id"
        | "refresh_token"
        | "access_token"
        | "expires_at"
        | "token_type"
        | "scope"
        | "id_token"
        | "session_state",
        [Rel<"Account_userId_fkey", "userId", "User">]
      >;
      Session: Table<SessionRow, "id", [Rel<"Session_userId_fkey", "userId", "User">]>;
      VerificationToken: Table<VerificationTokenRow>;
      Dealer: Table<
        DealerRow,
        Timestamps | "whatsapp" | "gstin" | "gstVerified" | "status",
        [Rel<"Dealer_userId_fkey", "userId", "User", true>]
      >;
      Store: Table<
        StoreRow,
        Timestamps | "logoUrl" | "bannerUrl" | "bio" | "primaryColor",
        [Rel<"Store_dealerId_fkey", "dealerId", "Dealer", true>]
      >;
      Listing: Table<
        ListingRow,
        | Timestamps
        | "transmission"
        | "condition"
        | "testDriveAvailable"
        | "description"
        | "status"
        | "viewCount"
        | "enquiryCount"
        | "isBoosted"
        | "boostExpiresAt"
        | "insuranceProvider"
        | "insuranceExpiry",
        [Rel<"Listing_dealerId_fkey", "dealerId", "Dealer">]
      >;
      ListingView: Table<
        ListingViewRow,
        "id" | "createdAt",
        [Rel<"ListingView_listingId_fkey", "listingId", "Listing">]
      >;
      ListingPhoto: Table<
        ListingPhotoRow,
        "id" | "sortOrder",
        [Rel<"ListingPhoto_listingId_fkey", "listingId", "Listing">]
      >;
      Listing360Photo: Table<
        Listing360PhotoRow,
        "id" | "createdAt",
        [Rel<"Listing360Photo_listingId_fkey", "listingId", "Listing">]
      >;
      Enquiry: Table<
        EnquiryRow,
        | Timestamps
        | "buyerId"
        | "buyerEmail"
        | "message"
        | "source"
        | "priority"
        | "isRead"
        | "isContacted"
        | "status",
        [
          Rel<"Enquiry_listingId_fkey", "listingId", "Listing">,
          Rel<"Enquiry_dealerId_fkey", "dealerId", "Dealer">,
          Rel<"Enquiry_buyerId_fkey", "buyerId", "User">,
        ]
      >;
      TestDrive: Table<
        TestDriveRow,
        Timestamps | "status" | "notes",
        [
          Rel<"TestDrive_listingId_fkey", "listingId", "Listing">,
          Rel<"TestDrive_dealerId_fkey", "dealerId", "Dealer">,
          Rel<"TestDrive_buyerId_fkey", "buyerId", "User">,
        ]
      >;
      RCTransfer: Table<
        RCTransferRow,
        | Timestamps
        | "status"
        | "currentStep"
        | "notes"
        | "sellerAgreed"
        | "buyerAgreed"
        | "docsSubmitted"
        | "rtoPending"
        | "rtoApproved"
        | "transferComplete",
        // Two foreign keys into User, which is why every embed of it here
        // must name the constraint: `seller:User!RCTransfer_sellerId_fkey(…)`.
        [
          Rel<"RCTransfer_listingId_fkey", "listingId", "Listing", true>,
          Rel<"RCTransfer_sellerId_fkey", "sellerId", "User">,
          Rel<"RCTransfer_buyerId_fkey", "buyerId", "User">,
        ]
      >;
      RCDocument: Table<
        RCDocumentRow,
        "id" | "createdAt",
        [Rel<"RCDocument_transferId_fkey", "transferId", "RCTransfer">]
      >;
      Conversation: Table<
        ConversationRow,
        Timestamps | "lastMessageAt",
        [
          Rel<"Conversation_listingId_fkey", "listingId", "Listing">,
          Rel<"Conversation_buyerId_fkey", "buyerId", "User">,
          Rel<"Conversation_dealerId_fkey", "dealerId", "Dealer">,
        ]
      >;
      Message: Table<
        MessageRow,
        "id" | "createdAt" | "readAt",
        [
          Rel<"Message_conversationId_fkey", "conversationId", "Conversation">,
          Rel<"Message_senderId_fkey", "senderId", "User">,
        ]
      >;
      SavedListing: Table<
        SavedListingRow,
        "id" | "createdAt",
        [
          Rel<"SavedListing_userId_fkey", "userId", "User">,
          Rel<"SavedListing_listingId_fkey", "listingId", "Listing">,
        ]
      >;
      ApiKey: Table<
        ApiKeyRow,
        "id" | "createdAt" | "key" | "keyHash" | "keyPrefix" | "lastUsedAt",
        [Rel<"ApiKey_dealerId_fkey", "dealerId", "Dealer">]
      >;
      Payout: Table<
        PayoutRow,
        Timestamps | "status" | "razorpayPayoutId" | "note",
        [Rel<"Payout_dealerId_fkey", "dealerId", "Dealer">]
      >;
      Inspector: Table<
        InspectorRow,
        "id" | "createdAt" | "certification" | "status",
        [Rel<"Inspector_userId_fkey", "userId", "User", true>]
      >;
      Inspection: Table<
        InspectionRow,
        | "id"
        | "createdAt"
        | "inspectorId"
        | "status"
        | "checklist"
        | "overallScore"
        | "notes"
        | "reportUrl"
        | "completedAt",
        [
          Rel<"Inspection_listingId_fkey", "listingId", "Listing">,
          Rel<"Inspection_inspectorId_fkey", "inspectorId", "Inspector">,
          Rel<"Inspection_dealerId_fkey", "dealerId", "Dealer">,
        ]
      >;
      Post: Table<
        PostRow,
        Timestamps | "community" | "tags" | "isPinned" | "isLocked",
        [Rel<"Post_authorId_fkey", "authorId", "User">]
      >;
      Reply: Table<
        ReplyRow,
        "id" | "createdAt",
        [
          Rel<"Reply_postId_fkey", "postId", "Post">,
          Rel<"Reply_authorId_fkey", "authorId", "User">,
        ]
      >;
      PostUpvote: Table<
        PostUpvoteRow,
        "id",
        [
          Rel<"PostUpvote_postId_fkey", "postId", "Post">,
          Rel<"PostUpvote_userId_fkey", "userId", "User">,
        ]
      >;
      LoanApplication: Table<
        LoanApplicationRow,
        Timestamps | "status" | "applicantPan" | "notes",
        [
          Rel<"LoanApplication_listingId_fkey", "listingId", "Listing">,
          Rel<"LoanApplication_buyerId_fkey", "buyerId", "User">,
        ]
      >;
      NotificationTemplate: Table<NotificationTemplateRow, "id" | "updatedAt" | "type">;
      Subscription: Table<
        SubscriptionRow,
        Timestamps | "plan" | "status" | "razorpaySubId",
        [Rel<"Subscription_dealerId_fkey", "dealerId", "Dealer", true>]
      >;
      Payment: Table<
        PaymentRow,
        | "id"
        | "createdAt"
        | "razorpayOrderId"
        | "razorpayPaymentId"
        | "razorpayEventId"
        | "razorpaySignature"
        | "currency"
        | "status"
        | "notes"
        | "dealerId"
        | "listingId"
      >;
    };
    Views: {
      user_public: { Row: Pick<UserRow, "id" | "name">; Relationships: [] };
      dealer_public: {
        Row: Pick<
          DealerRow,
          | "id"
          | "businessName"
          | "city"
          | "phone"
          | "whatsapp"
          | "gstVerified"
          | "status"
          | "createdAt"
        >;
        Relationships: [];
      };
    };
    Functions: {
      record_listing_view: {
        Args: { p_listing_id: string; p_visitor_id: string };
        Returns: boolean;
      };
      increment_enquiry_count: { Args: { p_listing_id: string }; Returns: undefined };
      unread_message_counts: {
        Args: { p_conversation_ids: string[]; p_user_id: string };
        Returns: { conversationId: string; count: number }[];
      };
      distinct_listing_cities: { Args: Record<string, never>; Returns: { city: string }[] };
      dealer_overview_metrics: {
        Args: { p_dealer_id: string; p_days: number };
        Returns: Json;
      };
      dealer_inventory_breakdown: { Args: { p_dealer_id: string }; Returns: Json };
      dealer_lead_analytics: {
        Args: { p_dealer_id: string; p_days: number };
        Returns: Json;
      };
      dealer_traffic_series: {
        Args: { p_dealer_id: string; p_days: number };
        Returns: Json;
      };
    };
    Enums: {
      Role: Role;
      DealerStatus: DealerStatus;
      VehicleType: VehicleType;
      VehicleCondition: VehicleCondition;
      FuelType: FuelType;
      Transmission: Transmission;
      ListingStatus: ListingStatus;
      EnquirySource: EnquirySource;
      EnquiryStatus: EnquiryStatus;
      TestDriveStatus: TestDriveStatus;
      RCTransferStatus: RCTransferStatus;
      PayoutStatus: PayoutStatus;
      InspectorStatus: InspectorStatus;
      InspectionStatus: InspectionStatus;
      Community: Community;
      NBFC: NBFC;
      LoanStatus: LoanStatus;
      TemplateType: TemplateType;
      PlanTier: PlanTier;
      SubStatus: SubStatus;
      PaymentKind: PaymentKind;
      PaymentStatus: PaymentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
