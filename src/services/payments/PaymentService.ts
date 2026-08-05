// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getStorageUrl } from "@/lib/storage-url";

export type Payment = Database["public"]["Tables"]["payments"]["Row"];

export class PaymentService {
  async initiatePayment(params: {
    userId: string;
    tournamentId?: string;
    amount: number;
    method: string;
    transactionCode?: string;
  }): Promise<{ payment: Payment | null; error?: Error }> {
    try {
      const { data, error } = await supabase
        .from("payments")
        .insert({
          user_id: params.userId,
          tournament_id: params.tournamentId,
          amount: params.amount,
          method: params.method,
          transaction_code: params.transactionCode,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return { payment: data };
    } catch (err: any) {
      return { payment: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async verifyPayment(paymentId: string, verifiedBy: string): Promise<{ error?: Error }> {
    try {
      const { error } = await supabase
        .from("payments")
        .update({ status: "completed" })
        .eq("id", paymentId);

      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async rejectPayment(
    paymentId: string,
    reason: string,
    rejectedBy: string,
  ): Promise<{ error?: Error }> {
    try {
      const { error } = await supabase
        .from("payments")
        .update({ status: "failed" }) // Assuming 'failed' or 'rejected'
        .eq("id", paymentId);

      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async getPaymentHistory(userId: string, limit: number = 20): Promise<Payment[]> {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return [];
      return data as Payment[];
    } catch (err) {
      return [];
    }
  }

  async getPendingPayments(): Promise<Payment[]> {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (error) return [];
      return data as Payment[];
    } catch (err) {
      return [];
    }
  }

  async uploadScreenshot(file: File, paymentId: string): Promise<{ url: string; error?: Error }> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in to upload a receipt");

      const fileExt = file.name.split(".").pop();
      // storage policies require the first folder to be the user's id
      const filePath = `${user.id}/${paymentId}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("screenshots")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const signedUrl = await getStorageUrl("screenshots", filePath);

      // Update payment record with screenshot URL
      await supabase
        .from("payments")
        .update({ screenshot_url: signedUrl } as any)
        .eq("id", paymentId);

      return { url: signedUrl };
    } catch (err: any) {
      return { url: "", error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

}

export const paymentService = new PaymentService();
