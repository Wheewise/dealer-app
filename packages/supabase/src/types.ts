export type UserRole = "BUYER" | "DEALER" | "ASSOCIATE";

export type Profile = {
  id: string;
  role: UserRole;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  created_at: string;
};

export type DealerStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "REJECTED";

export type Dealer = {
  id: string;
  profile_id: string;
  business_name: string;
  gst_number: string;
  gst_verified_at: string | null;
  status: DealerStatus;
  city: string;
  association_id: string | null;
  trial_ends_at: string | null;
  logo_url: string | null;
  cover_photo_url: string | null;
  address: string | null;
  map_link: string | null;
  bio: string | null;
  slug: string | null;
  onboarded: boolean;
  created_at: string;
};

export type VehicleCategory = "CAR" | "BIKE" | "COMMERCIAL";
export type FuelType = "PETROL" | "DIESEL" | "CNG" | "ELECTRIC" | "HYBRID";
export type ListingStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "SOLD";

export type Vehicle = {
  id: string;
  slug: string;
  dealer_id: string;
  category: VehicleCategory;
  reg_number: string | null;
  make: string;
  model: string;
  year: number;
  fuel_type: FuelType;
  transmission: string | null;
  odometer_km: number;
  asking_price: number;
  city: string;
  description: string | null;
  status: ListingStatus;
  photo_urls: string[];
  vehicle_class: string | null;
  color: string | null;
  body_type: string | null;
  seating_capacity: number | null;
  unladen_weight_kg: number | null;
  cubic_capacity_cc: number | null;
  horsepower_bhp: number | null;
  wheelbase_mm: number | null;
  mfg_month: number | null;
  cylinders: number | null;
  emission_norms: string | null;
  created_at: string;
  updated_at: string;
};
