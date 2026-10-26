import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TicketTable from "@/components/dashboard/TicketTable";
import TicketModal from "@/components/tickets/TicketModal";
import CreateTicketModal from "@/components/tickets/CreateTicketModal";
import { Plus, Search, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Tickets() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  
  const { toast } = useToast();
  
  const handleCreateTicket = () => {
    setIsCreateModalOpen(true);
  };
  
  return (
    <section className="p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-neutral-700">Chamados</h2>
        <Button onClick={handleCreateTicket} className="flex items-center">
          <Plus className="h-4 w-4 mr-2" /> Novo Chamado
        </Button>
      </div>
      
      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-neutral-700">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <Input
                placeholder="Pesquisar chamados..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="novo">Novo</SelectItem>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="respondido">Respondido</SelectItem>
                <SelectItem value="resolvido">Resolvido</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as prioridades</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="média">Média</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Tickets Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-neutral-700">Lista de Chamados</CardTitle>
        </CardHeader>
        <CardContent>
          <TicketTable 
            statusFilter={statusFilter}
            priorityFilter={priorityFilter}
            searchTerm={searchTerm}
          />
        </CardContent>
      </Card>
      
      {/* Create Ticket Modal */}
      <CreateTicketModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </section>
  );
}
