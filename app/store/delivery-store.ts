import { create } from "zustand";

export interface DeliveryLocationDetails {
  pincode: string;
  postOffice?: string;
  district?: string;
  state?: string;
}

interface DeliveryStoreState {
  pincode: string;
  locationDetails: DeliveryLocationDetails | null;
  setPincode: (pincode: string, details?: DeliveryLocationDetails | null) => void;
  initialize: () => void;
}

export const useDeliveryStore = create<DeliveryStoreState>((set) => ({
  pincode: "",
  locationDetails: null,
  setPincode: (pincode: string, details: DeliveryLocationDetails | null = null) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("sourceasia_delivery_pincode", pincode);
        sessionStorage.setItem("sourceasia_delivery_pincode", pincode);
        if (details) {
          localStorage.setItem("sourceasia_delivery_details", JSON.stringify(details));
        }
      } catch (e) {
        console.error("Error storing delivery location:", e);
      }
    }
    set({ pincode, locationDetails: details });
  },
  initialize: () => {
    if (typeof window !== "undefined") {
      try {
        const savedCode =
          localStorage.getItem("sourceasia_delivery_pincode") ||
          sessionStorage.getItem("sourceasia_delivery_pincode") ||
          "";
        const savedDetailsRaw = localStorage.getItem("sourceasia_delivery_details");
        let savedDetails: DeliveryLocationDetails | null = null;
        if (savedDetailsRaw) {
          try {
            savedDetails = JSON.parse(savedDetailsRaw);
          } catch {
            savedDetails = null;
          }
        }
        set({ pincode: savedCode, locationDetails: savedDetails });
      } catch (e) {
        console.error("Error initializing delivery store:", e);
      }
    }
  },
}));
