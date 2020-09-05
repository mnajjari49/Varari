odoo.define('ecotech_pos_laundry.popups', function (require) {
    "use strict";
    var gui = require('point_of_sale.gui');
    var keyboard = require('point_of_sale.keyboard').OnscreenKeyboardWidget;
    var rpc = require('web.rpc');
    var chrome = require('point_of_sale.chrome');
    var utils = require('web.utils');
    var PopupWidget = require('point_of_sale.popups');
    var models = require('point_of_sale.models');

    var core = require('web.core');
    var QWeb = core.qweb;
    var round_pr = utils.round_precision;
    var _t = core._t;

    var PromiseDatePopupWidget = PopupWidget.extend({
        template: 'PromiseDatePopupWidget',

        show: function(options){
            this.order = options.order;
            self = this;
            this._super();
            this.renderElement();
        },

        click_confirm: function(){
            var self = this;
            if(self.order.draft_order){
                this.pos.get_order().set_draft_order(true);
                this.pos.push_order(this.pos.get_order()).then(function(){
                    self.gui.show_screen('receipt');
                });
            }
            this.gui.close_popup();
        },

        renderElement: function() {
            var self = this;
            this._super();
             var order = self.pos.get_order();
            var tommorow = moment(moment(new Date()).add(1, 'days'))
            if(!order.get_order_promise_date()){
                tommorow = tommorow
            }else{
                tommorow = order.get_order_promise_date();
            }
            $('#set_promise_date').datetimepicker({
                inline:false,
                format:'d/m/Y H:i',
                formatDate:'d/m/Y',
                startDate: false,
                value: tommorow.format('DD/MM/YYYY HH:mm:ss'),
                todayHighlight: true,
                onChangeDateTime:function(){
                    var promise_date = moment($('#set_promise_date').datetimepicker('getValue'));
                    var format_date = moment(promise_date);
                    order.set_order_promise_date(format_date);
                },
            });
        },
    });
    gui.define_popup({name:'promise_date_popup', widget: PromiseDatePopupWidget});

    var CreateAdjustmentPopupWidget = PopupWidget.extend({
        template: 'CreateAdjustmentPopupWidget',

        show: function(options){
            var self = this;
            this.flag = options.flag;
            this._super(options);

            self.partner_id = '';
            options = options || {};
            this.renderElement();
            var partners = this.pos.db.all_partners;
            var partners_list = [];

            if(partners && partners[0]){
                partners.map(function(partner){
                    partners_list.push({
                        'id':partner.id,
                        'value':partner.name,
                        'label':partner.phone,
                    });
                });
                $('#select_customer_adj').keypress(function(e){
                    $('#select_customer_adj').autocomplete({
                       source: function(request, response) {
                            var query = request.term;
                            var search_timeout = null;
                            if(query){
                                search_timeout = setTimeout(function(){
                                    var partners_list = [];
                                    var clients = self.pos.db.search_membership_card_customer(query);
                                    _.each(clients, function(partner){
                                       partners_list.push({
                                           'id':partner.id,
                                           'value':partner.name,
                                           'label':partner.name
                                       });
                                    });
                                    response(partners_list);
                                },70);
                            }
                       },
                       select: function(event, partner) {
                            event.stopImmediatePropagation();
                            // event.preventDefault();
                            if (partner.item && partner.item.id) {
                                self.partner_id =  partner.item.id;
                                var partner_obj = _.find(self.partners, function(customer) {
                                    return customer.id == partner.item.id;
                                });
                                if (partner_obj) {
                                    self.set_customer(partner_obj);
                                }
                            }
                       },
                       focus: function(event, ui) {
                            event.preventDefault(); // Prevent the default focus behavior.
                       },
                       close: function(event) {
                            // it is necessary to prevent ESC key from propagating to field
                            // root, to prevent unwanted discard operations.
                            if (event.which === $.ui.keyCode.ESCAPE) {
                                event.stopPropagation();
                            }
                       },
                        autoFocus: true,
                        html: true,
                        minLength: 1,
                        delay: 200
                    });
                });
            }
            $("#adjustment_amount").keypress(function (e) {
                if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
               }
            });

            var partner = null;
            for ( var j = 0; j < self.pos.partners.length; j++ ) {
                partner = self.pos.partners[j];
                self.partner=this.partner
            }
        },
        click_confirm: function(){
            var self = this;
            
            var order = self.pos.get_order();
            if($('#select_customer_adj').val() == ''){
                self.partner_id = false;
            }

            $('#adjustment_amount').focus();
            var input_amount =this.$('#adjustment_amount').val();
            var selected_reason = $('#select_reason').val();

            var select_customer = self.partner_id;

            if(!self.partner_id){
                alert(_t('PLease Select Customer For Adjustment!'));
                $('#select_customer_adj').focus();
                return
            }
            if(!input_amount || Number(input_amount) == 0){
                alert(_t('PLease Add Amount For Adjustment!'));
                $('#adjustment_amount').focus();
                return
            }
            if(!selected_reason){
                alert(_t('PLease Select Reason For Adjustment!'));
                $('#select_reason').focus();
                return
            }
            if(self.partner_id){
                var client = self.pos.db.get_partner_by_id(self.partner_id);
            }

            if(input_amount  && self.partner_id){
                order.set_client(client);
                var product = self.pos.db.get_product_by_id(self.pos.config.adjustment_product[0]);
                if (self.pos.config.adjustment_product[0]){
                    var orderlines=order.get_orderlines()
                    for(var i = 0, len = orderlines.length; i < len; i++){
                        order.remove_orderline(orderlines);
                    }
                    var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                    line.price_manually_set = true;
                    line.set_unit_price(Number(input_amount));
                    line.set_quantity(this.flag? 1: -1);
                    order.add_orderline(line);
                    order.select_orderline(order.get_last_orderline());
                }
                var adjustment_obj = {
                    'partner_id': self.partner_id || false,
                    'adjustment_date': moment().format('YYYY-MM-DD'),
                    'adjustment_amount': this.flag?Number(input_amount):-Number(input_amount),
                    'adjustment_reason': Number(selected_reason),
                }
                order.set_customer_adjustment(adjustment_obj);
                order.set_is_customer_adjustment(true);
                var payment_line = this.pos.payment_methods_by_id[self.pos.config.jr_for_adjustment[0]]

                order.add_paymentline(payment_line);
                order.selected_paymentline.set_amount(this.flag?Number(input_amount):-Number(input_amount));
                self.pos.gui.chrome.screens.payment.finalize_validation();
                self.gui.show_screen('receipt');
                $( "#select_customer_adj").off("click");
                this.gui.close_popup();
            }
        },

        renderElement: function() {
            var self = this;
            this._super();
        },
    });
    gui.define_popup({name:'create_cust_adjustment_popup', widget: CreateAdjustmentPopupWidget});

    var CreatePreviousPopupWidget = PopupWidget.extend({
        template: 'CreatePreviousPopupWidget',

        show: function(options){
            var self = this;
            this.flag = true ; //always positive qty
            this._super(options);

            self.partner_id = '';
            options = options || {};
            this.renderElement();
            var partners = this.pos.db.all_partners;
            var partners_list = [];

            if(partners && partners[0]){
                partners.map(function(partner){
                    partners_list.push({
                        'id':partner.id,
                        'value':partner.name,
                        'label':partner.phone,
                    });
                });
                $('#select_customer_pre').keypress(function(e){
                    $('#select_customer_pre').autocomplete({
                       source: function(request, response) {
                            var query = request.term;
                            var search_timeout = null;
                            if(query){
                                search_timeout = setTimeout(function(){
                                    var partners_list = [];
                                    var clients = self.pos.db.search_membership_card_customer(query);
                                    _.each(clients, function(partner){
                                       partners_list.push({
                                           'id':partner.id,
                                           'value':partner.name,
                                           'label':partner.name
                                       });
                                    });
                                    response(partners_list);
                                },70);
                            }
                       },
                       select: function(event, partner) {
                            event.stopImmediatePropagation();
                            // event.preventDefault();
                            if (partner.item && partner.item.id) {
                                self.partner_id =  partner.item.id;
                                var partner_obj = _.find(self.partners, function(customer) {
                                    return customer.id == partner.item.id;
                                });
                                if (partner_obj) {
                                    self.set_customer(partner_obj);
                                }
                            }
                       },
                       focus: function(event, ui) {
                            event.preventDefault(); // Prevent the default focus behavior.
                       },
                       close: function(event) {
                            // it is necessary to prevent ESC key from propagating to field
                            // root, to prevent unwanted discard operations.
                            if (event.which === $.ui.keyCode.ESCAPE) {
                                event.stopPropagation();
                            }
                       },
                        autoFocus: true,
                        html: true,
                        minLength: 1,
                        delay: 200
                    });
                });
            }
            $("#previous_amount").keypress(function (e) {
                if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
               }
            });

            var partner = null;
            for ( var j = 0; j < self.pos.partners.length; j++ ) {
                partner = self.pos.partners[j];
                self.partner=this.partner
            }
        },
        click_confirm: function(){
            var self = this;

            var order = self.pos.get_order();
            if($('#select_customer_pre').val() == ''){
                self.partner_id = false;
            }

            $('#previous_amount').focus();
            var input_amount =this.$('#previous_amount').val();
            var input_note = this.$('#previous_note').val();
//            var selected_reason = $('#select_reason').val();

            var select_customer = self.partner_id;

            if(!self.partner_id){
                alert(_t('PLease Select Customer For Adjustment!'));
                $('#select_customer_pre').focus();
                return
            }
            if(!input_amount || Number(input_amount) == 0){
                alert(_t('PLease Add Amount For Previous order !'));
                $('#previous_amount').focus();
                return
            }

            if(self.partner_id){
                var client = self.pos.db.get_partner_by_id(self.partner_id);
            }

            if(input_amount  && self.partner_id){
                order.set_client(client);
                var product = self.pos.db.get_product_by_id(self.pos.config.previous_product[0]);
                if (self.pos.config.previous_product[0]){
                    var orderlines=order.get_orderlines()
                    for(var i = 0, len = orderlines.length; i < len; i++){
                        order.remove_orderline(orderlines);
                    }
                    var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                    line.price_manually_set = true;
                    line.set_unit_price(Number(input_amount));
                    line.set_quantity(this.flag? 1: -1);
                    order.add_orderline(line);
                    order.select_orderline(order.get_last_orderline());
                }
                var prev = {
                    'partner_id': self.partner_id || false,
                    'previous_date': moment().format('YYYY-MM-DD'),
                    'previous_amount': this.flag?Number(input_amount):-Number(input_amount),
                }
                //todo : must handel in backend if it need to view in UI
                self.gui.show_screen('payment');
                order.set_is_previous_order(true);
                order.set_customer_previous(prev);
                order.note=input_note;
//                var payment_line = this.pos.payment_methods_by_id[self.pos.config.jr_for_previous[0]]
                //todo : add it to popup if must chooice

//                order.add_paymentline(payment_line);
//                order.selected_paymentline.set_amount(this.flag?Number(input_amount):-Number(input_amount));
//                self.pos.gui.chrome.screens.payment.finalize_validation();
//                self.gui.show_screen('receipt');
                $( "#select_customer_pre").off("click");
                this.gui.close_popup();
            }
        },

        renderElement: function() {
            var self = this;
            this._super();
        },
    });
    gui.define_popup({name:'create_prev_popup', widget: CreatePreviousPopupWidget});

    var RackSelectionPopupWidget = PopupWidget.extend({
        template: 'RackSelectionPopupWidget',
        events: _.extend({}, PopupWidget.prototype.events, {
            'click span.remove-rack': 'removeRack',
            'click .button.add_rack': 'addRack',
        }),
        show: function(options){
            self = this;
            this.order_ref = options.order.name || '';
            this.order = options.order;
            this.rack = this.pos.db.get_rack_by_ids(options.order.order_rack_id);
            this.old_rack_ids = options.order.order_rack_id;
            this.rack_ids = _.uniq(this.order.order_rack_id);
            this.flag = false;
            this._super();
        },
        click_cancel: function(){
            var self = this;
            var order = this.order;
            if(this.old_rack_ids.length == 0 && this.rack_ids.length == 0){
                    rpc.query({
                        model: 'pos.order',
                        method: 'write',
                        args: [order.id, {'delivery_state_id': 4}]
                    },{async: false}).then(function(result) {
                        if(result){
                            self.pos.gui.chrome.screens.orderlist.reloading_orders();
                            self.pos.gui.chrome.screens.posreportscreen.reloading_orders();
                        }
                    });
                }else{
                     self.pos.gui.chrome.screens.orderlist.reloading_orders();
                     self.pos.gui.chrome.screens.posreportscreen.reloading_orders();
            }
            self._super();
        },
        click_confirm: function(){
            if (this.old_rack_ids.length == 0 && this.rack_ids.length == 0 ){
                alert("Please Add at Least one Rack");
            }
            else{
                var self = this;
                var rack_ids = this.rack_ids;
                var update_rack_status = _.uniq(rack_ids.concat(this.old_rack_ids));
                if(self.flag){
                    var OrderPromise = new Promise(function(resolve, reject){
                        var params = {
                            model: 'pos.order',
                            method: "write",
                            args: [[self.order.id], {'order_rack_id': rack_ids ? [[6,0, rack_ids]] : [[5,]]}],
                        }
                        rpc.query(params, {async: false})
                        .then(function(res){
                            if(res){
                                self.pos.gui.chrome.screens.orderlist.reloading_orders();
                                self.pos.gui.chrome.screens.posreportscreen.reloading_orders();
                                resolve(res);
                            }else{
                                reject();
                            }
                        });
                    })
                    var UpdateRackStatusPromise = new Promise(function(resolve, reject){
                        var params = {
                            model: 'pos.order.rack',
                            method: "update_rack_status",
                            args: [self.rack_ids, self.old_rack_ids],
                        }
                        rpc.query(params, {async: false})
                        .then(function(res){
                            if(res){
                                resolve(res);
                            }else{
                                reject();
                            }
                        });
                    })
                    Promise.all([OrderPromise, UpdateRackStatusPromise]).then(function(res) {
                        self.pos.gui.chrome.screens.orderlist.reloading_racks();
    //                    self.pos.gui.chrome.screens.posreportscreen.reloading_racks();
                    }).catch(function(error) {
                        console.error('error', error);
                    });
                }
                this.gui.close_popup()
            }
        },
        render_rack : function(){
            var rack_list = this.pos.db.get_rack_by_ids(this.rack_ids);
            var contents = this.$el[0].querySelector('div.grid-wrapper');
            contents.innerHTML = "";
            var rack_html = QWeb.render('renderRack',{widget: this, rack:rack_list});
            $(contents).html(rack_html)
        },
        removeRack : function(event){
            var currentTarget = $(event.currentTarget)
            var rack_id = currentTarget.data('id');
            this.rack_ids = _.without(this.rack_ids, Number(rack_id));
            self.flag = true;
            self.render_rack();
        },
        renderElement: function() {
            var self = this;
            this._super();
            $('#rack_selection').keypress(function(e){
                $('#rack_selection').autocomplete({
                    source: function(request, response) {
                        var query = request.term;
                        var search_timeout = null;
                        if(query){
                            search_timeout = setTimeout(function(){
                                var rack_list = [];
                                var racks = _.filter(self.pos.db.search_rack(query), function(r){
                                                return !_.contains(self.rack_ids, r.id);
                                            })
                                _.each(racks, function(rack){
                                   rack_list.push({
                                       'id':rack.id,
                                       'value':rack.name,
                                       'label':rack.name
                                   });
                                });
                                response(rack_list);
                            },70);
                        }
                    },
                    select: function(event, rack) {
                        event.stopImmediatePropagation();
//                            event.preventDefault();
                        if (rack.item && rack.item.id) {
                            self.add_rack_id = rack.item.id;
                            self.rack_ids.push(rack.item.id);
                            self.flag = true;
                            self.render_rack();
                        }
                    },
                    focus: function(event, ui) {
                        event.preventDefault(); // Prevent the default focus behavior.
                    },
                    close: function(event) {
                        // it is necessary to prevent ESC key from propagating to field
                        // root, to prevent unwanted discard operations.
                        if (event.which === $.ui.keyCode.ESCAPE) {
                            event.stopPropagation();
                        }
                    },
                    autoFocus: true,
                    html: true,
                    minLength: 1,
                    delay: 200
                });
            });
        },
    });
    gui.define_popup({name:'rack_selection', widget: RackSelectionPopupWidget});

    var EditPreferencePopupWidget = PopupWidget.extend({
        template: 'EditPreferencePopupWidget',

        show: function(options){
            self = this;
            this._super();
            this.pref_name = options.name || "";
            this.pref_id = options.id || "";
            this.pref_desc = options.desc || "";
            this.renderElement();
        },

        click_confirm: function(){
            var self = this;
            var pref_name = this.$('#pref_name').val();
            var pref_desc = this.$('#pref_desc').val();
            var method = false;
            var args = false
            if(this.pref_id){
                method = 'write';
                args = [[self.pref_id], {'name': pref_name, 'description':pref_desc || '' }];
            }else{
                method = 'create';
                args = [{'name': pref_name, 'description':pref_desc || '' }];
            }
            if(pref_name){
                var params = {
                    model: 'customer.preference',
                    method: method,
                    args: args,
                }
                rpc.query(params, {async: false})
                .then(function(res){
                    if(res){
                      self.pos.customer_preference = res;
                      self.pos.gui.chrome.screens.customer_preferences.reloading_preferences();
                    }
                });
                this.gui.close_popup();
            }else{
                alert("Please Enter Preference Name.");
            }
        },

        renderElement: function() {
            var self = this;
            this._super();
        },
    });
    gui.define_popup({name:'edit_preference_popup', widget: EditPreferencePopupWidget});

    var MaxCreditExceedPopupWidget = PopupWidget.extend({
        template: 'MaxCreditExceedPopupWidget',
        show: function(options){
            var self = this;
            this._super(options);
        },
        events: _.extend({}, PopupWidget.prototype.events, {
            'click .button.override_payment':  'click_override_payment',
        }),
        click_override_payment: function(){
            var self = this;
            if(self.options.draft_order){
                 self.gui.show_popup('promise_date_popup', {order:self.options});
            }else if(self.options.partial_paid_order){
                this.pos.get_order().set_partial_paid_order(true);
                this.gui.close_popup();
            }

            if(self.options.payment_obj){
                this.options.payment_obj.finalize_validation();
                this.gui.close_popup();
            }



        },
    });
    gui.define_popup({name:'max_limit', widget: MaxCreditExceedPopupWidget});

    var ProductPopup = PopupWidget.extend({
        template: 'ProductPopup',
        show: function(options){
            var self = this;
            this._super();
            this.order_lines = options.order_lines || false;
            this.order_id = options.order_id || false;
            this.state = options.state || false;
            this.order_screen_obj = options.order_screen_obj || false;
            this.renderElement();
        },
        click_confirm: function(){
            if (this.state == "paid" || this.state == "done"){
                $("#re_order_duplicate[data-id='"+ this.order_id +"']").click();
            } else if(this.state == "draft") {
                $("#edit_order[data-id='"+ this.order_id +"']").click();
            }
            this.gui.close_popup();
        },
        click_cancel: function(){
            this.gui.close_popup();
        }

    });
    gui.define_popup({name:'product_popup', widget: ProductPopup});

    var CreateMembershipCardPopupWidget = PopupWidget.extend({
        template: 'CreateMembershipCardPopupWidget',

        show: function(options){
            var self = this;
            this._super(options);
            self.partner_id = '';
            options = options || {};
            self.panding_card = options.card_data || false;
            this.renderElement();
            $('#card_no').focus();

            $('#text_amount').on('change', function (e) {
            var offer = $("option:selected", this).attr("offer");
            if(offer>0){
                        $('#membership_offer').text( "Offer  " + offer);

            }else{
            $('#membership_offer').text( "");

            }


});
            var timestamp = new Date().getTime()/1000;
            var partners = this.pos.db.all_partners;
            var partners_list = [];
            if(self.pos.config.default_exp_date && !self.panding_card){
                var date = new Date();
                date.setMonth(date.getMonth() + self.pos.config.default_exp_date);
                var new_date = date.getFullYear()+ "/" +(date.getMonth() + 1)+ "/" +date.getDate();
                self.$('#text_expire_date').val(moment(new_date).format('DD/MM/YYYY'));
            }
            if(partners && partners[0]){
                partners.map(function(partner){
                    partners_list.push({
                        'id':partner.id,
                        'value':partner.name,
                        'label':partner.phone,
                    });
                });
                $('#select_customer').keypress(function(e){
                    $('#select_customer').autocomplete({
                       source: function(request, response) {
                            var query = request.term;
                            var search_timeout = null;
                            if(query){
                                search_timeout = setTimeout(function(){
                                    var partners_list = [];
                                    var clients = self.pos.db.search_membership_card_customer(query);
                                    _.each(clients, function(partner){
                                       partners_list.push({
                                           'id':partner.id,
                                           'value':partner.name,
                                           'label':partner.name
                                       });
                                    });
                                    response(partners_list);
                                },70);
                            }
                       },
                       select: function(event, partner) {
                            event.stopImmediatePropagation();
                            // event.preventDefault();
                            if (partner.item && partner.item.id) {
                                self.partner_id =  partner.item.id;
                                var partner_obj = _.find(self.partners, function(customer) {
                                    return customer.id == partner.item.id;
                                });
                                if (partner_obj) {
                                    self.set_customer(partner_obj);
                                }
                            }
                       },
                       focus: function(event, ui) {
                            event.preventDefault(); // Prevent the default focus behavior.
                       },
                       close: function(event) {
                            // it is necessary to prevent ESC key from propagating to field
                            // root, to prevent unwanted discard operations.
                            if (event.which === $.ui.keyCode.ESCAPE) {
                                event.stopPropagation();
                            }
                       },
                        autoFocus: true,
                        html: true,
                        minLength: 1,
                        delay: 200
                    });
                });
                if(self.panding_card){
                    self.partner_id = self.panding_card.membership_card_customer;
                    $('#checkbox_paid').prop('checked',true);
                }
            }
            $("#text_amount").keypress(function (e) {
                if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
               }
            });
            if(self.pos.config.manual_card_number && !self.panding_card){
                $('#card_no').removeAttr("readonly");
                $("#card_no").keypress(function (e) {
                    if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                        return false;
                   }
                });
            } else if(!self.panding_card){
                $('#card_no').val(window.parseInt(timestamp));
                $('#card_no').attr("readonly", "readonly");
            }
            var partner = null;
            for ( var j = 0; j < self.pos.partners.length; j++ ) {
                partner = self.pos.partners[j];
                self.partner=this.partner
            }


            $("#checkbox_paid").on("click", function (e) {
                var checkbox = $(this);
                if (checkbox.is(":checked")) {
                    // do the confirmation thing here
                    e.preventDefault();
                    return true;
                }else{
                    return false;
                }
            });
        },
        click_confirm: function(){
            var self = this;
            var move = true;
            var order = self.pos.get_order();
            if($('#select_customer').val() == ''){
                self.partner_id = false;
            }
            var checkbox_paid = document.getElementById("checkbox_paid");
            var expire_date = moment($('#text_expire_date').val(), 'DD/MM/YYYY').format('YYYY-MM-DD');
            var select_customer = self.partner_id;
            var select_card_type = $('#select_card_type').val();
            var card_number = $('#card_no').val();
            if(!card_number){
                alert("Enter Membership card number");
                return;
            } else{
                var MembershipPromise = new Promise(function(resolve, reject){
                    var params = {
                        model: 'membership.card',
                        method: 'search_read',
                        domain: ['|', ['card_no', '=', $('#card_no').val()], ['customer_id', '=', self.partner_id]],
                    }
                    rpc.query(params, {async: false}).then(function(result){
                        if(result.length > 0){
                            $('#card_no').css('border', 'thin solid red');
                            move = false;
                            alert("Card already exist");
                           reject()
                        } else{
                            resolve();
                        }
                    });
                });
                MembershipPromise.then(function(result){
                    $('#card_no').css('border', '0px');
                    if(self.partner_id){
                        var client = self.pos.db.get_partner_by_id(self.partner_id);
                    }
                    if(expire_date){
                        if(checkbox_paid.checked){
                            $('#text_amount').focus();
                            var input_amount = $('#text_amount').val();
                            order.membership_offer=$(".text_amount").find("option:selected").attr("offer");
                            $('#membership_offer').val(order.membership_offer);
                            if(input_amount){
                                order.set_client(client);
                                var product = self.pos.db.get_product_by_id(self.pos.config.membership_card_product_id[0]);
                                if (self.pos.config.membership_card_product_id[0]){
                                    var orderlines=order.get_orderlines()
                                    for(var i = 0, len = orderlines.length; i < len; i++){
                                        order.remove_orderline(orderlines);
                                    }
                                    var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                                    line.set_unit_price(input_amount);
                                    order.add_orderline(line);
                                    order.select_orderline(order.get_last_orderline());
                                }
                                var membership_order = {
                                    'membership_card_card_no': $('#card_no').val(),
                                    'membership_card_customer': select_customer ? select_customer : false,
                                    'membership_card_expire_date': moment($('#text_expire_date').val(), 'DD/MM/YYYY').format('YYYY-MM-DD'),
                                    'membership_amount': Number(input_amount)+Number(
$(".text_amount").find("option:selected").attr("offer")),
                                    'membership_card_customer_name': $("#select_customer").val(),
                                    'membership_card_type': $('#select_card_type').val(),
                                }
                                if(self.pos.config.msg_before_card_pay) {
                                    self.gui.show_popup('confirmation_membership_card_payment',{'card_data':membership_order});
                                } else{
                                    order.set_membership_card(membership_order);
                                    order.membership_offer=$(".text_amount").find("option:selected").attr("offer");
                                    self.gui.show_screen('payment');
                                    self.pos.get_order().set_membership_order(true);
                                    $("#card_back").hide();
                                    $( "div.js_set_customer" ).off("click");
                                    $( "div#card_invoice" ).off("click");
                                    self.gui.close_popup();
                                }
                            }else{
                                alert("Please enter card value.")
                                $('#text_amount').focus();
                            }
                        }else{
                            var input_amount =$('#text_amount').val();
                            if(input_amount){
                                order.set_client(self.pos.db.get_partner_by_id(self.partner_id));
                                order.set_free_data({
                                    'membership_card_card_no': $('#card_no').val(),
                                    'membership_card_customer': select_customer ? select_customer : false,
                                    'membership_card_expire_date': moment($('#text_expire_date').val(), 'DD/MM/YYYY').format('YYYY-MM-DD'),
                                    'membership_amount': Number($('#text_amount').val()),
                                    'membership_card_customer_name': $("#select_customer").val(),
                                    'membership_card_type': $('#select_card_type').val() || 1,
                                })
                                var params = {
                                    model: "membership.card",
                                    method: "create",
                                    args: [{
                                        'card_no': Number($('#card_no').val()),
                                        'card_value': Number($('#text_amount').val()),
                                        'customer_id': self.partner_id ? Number(self.partner_id) : false,
                                        'expire_date': moment($('#text_expire_date').val(), 'YYYY/MM/DD').format('YYYY-MM-DD'),
                                        'card_type': Number($('#select_card_type').val()),
                                    }]
                                }
                                rpc.query(params, {async: false});
                                self.gui.show_screen('receipt');
                                self.pos.get_order().set_membership_order(true);
                                order.membership_offer=$(".text_amount").find("option:selected").attr("offer");
                                this.gui.close_popup();
                            }else{
                                alert("Please enter card value.")
                                $('#text_amount').focus();
                            }
                        }
                    }else{
                        alert("Please select expire date.")
                        $('#text_expire_date').focus();
                    }
                })
            }
        },

        renderElement: function() {
            var self = this;
            this._super();
            $('.datetime').datepicker({
                minDate: 0,
                dateFormat:'dd/mm/yy',
                changeMonth: true,
                changeYear: true,
            });

//             $("#text_gift_card_no").focus(function() {
//                $('body').off('keypress', self.keyboard_handler);
//                $('body').off('keydown', self.keyboard_keydown_handler);
//                window.document.body.removeEventListener('keypress',self.keyboard_handler);
//                window.document.body.removeEventListener('keydown',self.keyboard_keydown_handler);
//
//            });
//
//            $("#text_gift_card_no").focusout(function() {
//                $('body').on('keypress', self.keyboard_handler);
//                $('body').on('keydown', self.keyboard_keydown_handler);
//            });
            
            $("#text_redeem_amount").focus(function() {
                $('body').off('keypress', self.keyboard_handler);
                $('body').off('keydown', self.keyboard_keydown_handler);
                window.document.body.removeEventListener('keypress',self.keyboard_handler);
                window.document.body.removeEventListener('keydown',self.keyboard_keydown_handler);

            });

            $("#text_redeem_amount").focusout(function() {
                $('body').on('keypress', self.keyboard_handler);
                $('body').on('keydown', self.keyboard_keydown_handler);
            });

        },
    });
    gui.define_popup({name:'create_membership_card_popup', widget: CreateMembershipCardPopupWidget});

    var RedeemMembershipCardPopupWidget = PopupWidget.extend({
        template: 'RedeemMembershipCardPopupWidget',

        show: function(options){
           this.payment_self = options.payment_self || false;
           this.card = options.card || false;
           this._super();
           self = this;

           self.redeem = false;
           var order = self.pos.get_order();

           $('body').off('keypress', self.payment_self.keyboard_handler);
           $('body').off('keydown', self.payment_self.keyboard_keydown_handler);
           this.renderElement();
           $("#text_redeem_amount").val(this.card.card_value)
           $("#text_redeem_amount").keypress(function (e) {
               if(e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
               }
            });
//           $('#text_gift_card_no').focus();
            if(this.card){
                var today = moment().format('YYYY-MM-DD');
//                var code = $(this).val();
                var get_redeems = order.get_redeem_membership_card();
                var existing_card = _.where(get_redeems, {'redeem_card': this.card.card_no });
                var params = {
                    model: 'membership.card',
                    method: 'search_read',
                    domain: [['card_no', '=', this.card.card_no], ['expire_date', '>=', today], ['issue_date', '<=', today]],
                }
                rpc.query(params, {async: false})
                .then(function(res){
                    if(res.length > 0){
                        if (res[0]){
                            if(existing_card.length > 0){
                                res[0]['card_value'] = existing_card[existing_card.length - 1]['redeem_remaining']
                            }
                            self.redeem = res[0];
                            $('#lbl_card_no').html("Your Balance is  "+ self.format_currency(res[0].card_value));
                            if(res[0].customer_id[1]){
                                $('#lbl_set_customer').html("Hello  "+ res[0].customer_id[1]);
                            } else{
                                $('#lbl_set_customer').html("Hello  ");
                            }

                            if(res[0].card_value <= 0){
                                $('#redeem_amount_row').hide();
                                $('#in_balance').show();
                            }else{
                                $('#redeem_amount_row').fadeIn('fast');
                                $('#text_redeem_amount').focus();
                            }
                        }
                    }else{
                        alert("Barcode not found or membership card has been expired.")
                        $('#text_gift_card_no').focus();
                        $('#lbl_card_no').html('');
                        $('#lbl_set_customer').html('');
                        $('#in_balance').html('');
                    }
                });
            }
        },

        click_cancel: function(){
            var self = this;
            self._super();
            $('body').on('keypress', self.payment_self.keyboard_handler);
            $('body').on('keydown', self.payment_self.keyboard_keydown_handler);
//            window.document.body.addEventListener('keypress',self.payment_self.keyboard_handler);
//            window.document.body.addEventListener('keydown',self.payment_self.keyboard_keydown_handler);
        },

        click_confirm: function(){
            var order = self.pos.get_order();
            var client = order.get_client();
            var redeem_amount = this.$('#text_redeem_amount').val();
            var code = this.card.card_no;
            if(self.redeem.card_no){
                if(code == self.redeem.card_no){
                    if(!self.redeem.card_value == 0){
                        if(redeem_amount){
                            if (redeem_amount <= (order.get_due() || order.get_total_with_tax())){
                                if(!client){
                                    order.set_client(self.pos.db.get_partner_by_id(self.redeem.customer_id[0]));
                                }
                                if( 0 < Number(redeem_amount)){
                                    if(self.redeem && self.redeem.card_value >= Number(redeem_amount) ){
                                        if(self.redeem.customer_id[0]){
                                            var vals = {
                                                'redeem_card_no':self.redeem.id,
                                                'redeem_card':code,
                                                'redeem_card_amount':$('#text_redeem_amount').val(),
                                                'redeem_remaining':self.redeem.card_value - $('#text_redeem_amount').val(),
                                                'card_customer_id': client ? client.id : self.redeem.customer_id[0],
                                                'customer_name': client ? client.name : self.redeem.customer_id[1],
                                            };
                                        } else {
                                            var vals = {
                                                'redeem_card_no':self.redeem.id,
                                                'redeem_card':code,
                                                'redeem_card_amount':$('#text_redeem_amount').val(),
                                                'redeem_remaining':self.redeem.card_value - $('#text_redeem_amount').val(),
                                                'card_customer_id': order.get_client() ? order.get_client().id : false,
                                                'customer_name': order.get_client() ? order.get_client().name : '',
                                            };
                                        }

                                        var get_redeem = order.get_redeem_membership_card();
                                        if(get_redeem){
                                            var product = self.pos.db.get_product_by_id(self.pos.config.enable_journal_id)
                                            if(self.pos.config.enable_journal_id[0]){
                                                var cashregisters = null;
                                                for ( var j = 0; j < self.pos.payment_methods.length; j++ ) {
                                                    if ( self.pos.payment_methods[j].id === self.pos.config.enable_journal_id[0] ){
                                                       cashregisters = self.pos.payment_methods[j];
                                                    }
                                                }
                                            }
                                            if (vals){
//                                                window.document.body.addEventListener('keypress',self.payment_self.keyboard_handler);
                                               // window.document.body.addEventListener('keydown',self.payment_self.keyboard_keydown_handler);
                                                if (cashregisters){
                                                    order.add_paymentline(cashregisters);
                                                    order.selected_paymentline.set_amount( Math.max(redeem_amount),0 );
                                                    order.selected_paymentline.set_membership_card_line_code(code);
                                                    order.selected_paymentline.set_freeze(true);
                                                    self.chrome.screens.payment.reset_input();
                                                    self.chrome.screens.payment.render_paymentlines();
                                                    order.set_redeem_membership_card(vals);
                                                }
                                            }
                                            this.gui.close_popup();
                                            $('body').on('keypress', self.payment_self.keyboard_handler);
                                            $('body').on('keydown',self.payment_self.keyboard_keydown_handler);
                                        }
                                    }else{
                                        alert("Please enter amount below card value.");
                                        $('#text_redeem_amount').focus();
                                    }
                                }else{
                                    alert("Please enter valid amount.");
                                    $('#text_redeem_amount').focus();
                                }
                            }else{
                                alert("Card amount should be less than or equal to Order Due Amount.");
                            }

                        }else{
                            alert("Please enter amount.");
                            $('#text_redeem_amount').focus();
                        }
                    }
                }else{
                    alert("Please enter valid barcode.");
                    $('#text_gift_card_no').focus();
                }
            }else{
                alert("Press enter key.");
                $('#text_gift_card_no').focus();
            }
            $('body').on('keypress', self.payment_self.keyboard_handler);
            $('body').on('keydown', self.payment_self.keyboard_keydown_handler);
        },
    });
    gui.define_popup({name:'redeem_membership_card_popup', widget: RedeemMembershipCardPopupWidget});

    var RechargeMembershipCardPopupWidget = PopupWidget.extend({
        template: 'RechargeMembershipCardPopupWidget',

        show: function(options){
            self = this;
            this._super();
            self.pending_card = options.recharge_card_data;
            if(!self.pending_card){
                this.card_no = options.card_no || "";
                this.card_id = options.card_id || "";
                this.card_value = options.card_value || 0 ;
                this.customer_id = options.customer_id || "";
            }
            this.renderElement();

            $('#text_recharge_amount').focus();
            $("#text_recharge_amount").keypress(function (e) {
                if(e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                    return false;
                }
            });

            //*********
            var offer_span= this.$('#membership_offer');
             this.$('#text_amount').on('change', function (e) {
             var offer = $("option:selected", this).attr("offer");
             if(offer>0){
                       offer_span.text( "Offer  " + offer);

            }else{
            offer_span.text( "");

            }
            });
            /////////
        },

        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            var client = order.get_client();
            var set_customer = $('#set_customers').val();
            if(!client){
                order.set_client(self.pos.db.get_partner_by_id(set_customer));
            }
            var offer = Number(this.$(".text_amount").find("option:selected").attr("offer"));
            var recharge_amount = Number(this.$('#text_amount').val())+offer;
;
            if (recharge_amount){
                if( 0 < Number(recharge_amount) ){
                    var vals = {
                    'recharge_card_id':self.card_id,
                    'recharge_card_no':self.card_no,
                    'recharge_card_amount':Number(recharge_amount),
                    'card_customer_id': self.customer_id[0] || false,
                    'customer_name': self.customer_id[1],
                    'total_card_amount':Number(recharge_amount)+self.card_value,
                    }
                    var get_recharge = order.get_recharge_membership_card();
                    if(get_recharge){
                        var product = self.pos.db.get_product_by_id(self.pos.config.membership_card_product_id[0]);
                        if (self.pos.config.membership_card_product_id[0]){
                            var orderlines=order.get_orderlines()
                            for(var i = 0, len = orderlines.length; i < len; i++){
                                order.remove_orderline(orderlines);
                            }
                            var line = new models.Orderline({}, {pos: self.pos, order: order, product: product});
                            line.set_unit_price(recharge_amount-offer);
                            order.add_orderline(line);
                            order.select_orderline(order.get_last_orderline());
                            order.membership_offer=offer;
                        }

                        if(self.pos.config.msg_before_card_pay){
                            self.gui.show_popup('confirmation_membership_card_payment',{'recharge_card_data':vals})
                        } else {
                            order.set_recharge_membership_card(vals);
                            self.pos.get_order().set_membership_order(true);
                            self.gui.show_screen('payment');
                             $("#card_back").hide();
                             $( "div.js_set_customer" ).off("click");
                             $( "div#card_invoice" ).off("click");
                            this.gui.close_popup();
                        }
                    }
                }else{
                   alert("Please enter valid amount.");
                   $('#text_recharge_amount').focus();
                }
            }else{
                alert("Please enter amount.");
                $('#text_recharge_amount').focus();
            }
        },
    });
    gui.define_popup({name:'recharge_membership_card_popup', widget: RechargeMembershipCardPopupWidget});
    //Pending
    var EditMembershipCardPopupWidget = PopupWidget.extend({
        template: 'EditMembershipCardPopupWidget',

        show: function(options){
            self = this;
            this._super();
            this.card_no = options.card_no || "";
            this.card_id = options.card_id || "";
            this.expire_date = options.expire_date || "";
            this.renderElement();
            $('#new_expire_date').focus();
            $('#new_expire_date').keypress(function(e){
                if( e.which == 8 || e.keyCode == 46 ) return true;
                return false;
            });
        },

        click_confirm: function(){
            var self = this;
            var new_expire_date = moment(this.$('#new_expire_date').val(), 'DD/MM/YYYY').format('YYYY-MM-DD');
            if(new_expire_date){
                if(self.card_no){
                    var params = {
                        model: 'membership.card',
                        method: 'write',
                        args: [[self.card_id], {'expire_date': new_expire_date}],
                    }
                    rpc.query(params, {async: false})
                    .then(function(res){
                        if(res){
                            self.pos.gui.chrome.screens.membershipcardlistscreen.reloading_membership_cards();
                        }
                    });
                    this.gui.close_popup();
                }else{
                    alert("Please enter valid card no.");
                }
            }else{
                alert("Please select date.");
                $('#new_expire_date').focus();
            }
        },

        renderElement: function() {
            var self = this;
            this._super();
            $('.date').datepicker({
                minDate: 0,
                dateFormat:'dd/mm/yy',
                changeMonth: true,
                changeYear: true,
            });
            self.$(".emptybox_time").click(function(){ $('#new_expire_date').val('') });
        },
    });
    gui.define_popup({name:'edit_membership_card_popup', widget: EditMembershipCardPopupWidget});

    var ExchangeMembershipCardPopupWidget = PopupWidget.extend({
        template: 'ExchangeMembershipCardPopupWidget',

        show: function(options){
            self = this;
            this._super();
            this.card_no = options.card_no || "";
            this.card_id = options.card_id || "";
            this.renderElement();
            $('#new_card_no').focus();
            var timestamp = new Date().getTime()/1000;
            if(self.pos.config.manual_card_number){
                $('#new_card_no').removeAttr("readonly");
                $("#new_card_no").keypress(function (e) {
                    if (e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && e.which != 46) {
                        return false;
                   }
                });
            } else{
                $('#new_card_no').val(window.parseInt(timestamp));
                $('#new_card_no').attr("readonly", "readonly");
            }

        },

        click_confirm: function(){
            var self = this;
            if(self.card_no){
                var card_number = $('#new_card_no').val();
                var move = true;
                if(!card_number){
                    alert("Enter Membership card number");
                    return;
                } else{
                    var params = {
                        model: 'membership.card',
                        method: 'search_read',
                        domain: [['card_no', '=', $('#new_card_no').val()]],
                    }
                    rpc.query(params, {async: false})
//	        		new Model('aspl.gift.card').call('search_count', [[]], {}, {async: false})
                    .then(function(result){
                        if(result > 0){
                            $('#new_card_no').css('border', 'thin solid red');
                            move = false;
                        } else{
                            $('#new_card_no').css('border', '0px');
                        }
                    });
                }
                if(!move){
                    alert("Card already exist");
                    return
                }
               var exchange_card_no = confirm("Are you sure you want to change card number?");
               if( exchange_card_no){
                  var params = {
                     model: "membership.card",
                     method: "write",
                     args: [[self.card_id],{'card_no':this.$('#new_card_no').val()}],
                  }
                  rpc.query(params, {async: false})
                  .then(function(res){
                      if(res){
                          self.pos.gui.chrome.screens.membershipcardlistscreen.reloading_membership_cards();
                      }
                  });
                  this.gui.close_popup();
               }
            }
        },
    });

    gui.define_popup({name:'exchange_membership_card_popup', widget: ExchangeMembershipCardPopupWidget});

    var ConfirmationMembershipCardPayment = PopupWidget.extend({
        template: 'ConfirmationMembershipCardPayment',

        show: function(options){
            self = this;
            this._super();
            self.options = options.card_data || false;
            self.recharge_card = options.recharge_card_data || false;
            self.renderElement();
        },
        click_confirm: function(){
            var self = this;
            var order = self.pos.get_order();
            if(self.recharge_card){
                var vals = {
                    'recharge_card_id':self.recharge_card.recharge_card_id,
                    'recharge_card_no':self.recharge_card.recharge_card_no,
                    'recharge_card_amount':self.recharge_card.recharge_card_amount,
                    'card_customer_id': self.recharge_card.card_customer_id || false,
                    'customer_name': self.recharge_card.customer_name,
                    'total_card_amount':self.recharge_card.total_card_amount,
                }
                order.set_recharge_membership_card(vals);
                self.pos.get_order().set_membership_order(true);
                var amounts=$(".text_amount").find("option:selected").attr("offer");
                self.pos.get_order().membership_offer= amounts;
                self.gui.show_screen('payment');
                $("#card_back").hide();
                $( "div.js_set_customer" ).off("click");
                $( "div#card_invoice" ).off("click");
                this.gui.close_popup();
            } else if(self.options){
                var membership_order = {
                        'membership_card_card_no': self.options.membership_card_card_no,
                        'membership_card_customer': self.options.membership_card_customer ? Number(self.options.membership_card_customer) : false,
                        'membership_card_expire_date': self.options.membership_card_expire_date,
                        'membership_amount': self.options.membership_amount,
                        'membership_card_customer_name': self.options.membership_card_customer_name,
                        'membership_card_type': self.options.card_type,
                }
                var amounts=$(".text_amount").find("option:selected").attr("offer");
                self.pos.get_order().membership_offer= amounts;
                self.pos.get_order().set_membership_order(true);
                order.set_membership_card(membership_order);
                self.gui.show_screen('payment');
                $("#card_back").hide();
                $( "div.js_set_customer" ).off("click");
                $( "div#card_invoice" ).off("click");
                this.gui.close_popup();
            }
        },
        click_cancel: function(){
            var self = this;
            if(self.recharge_card){
                self.gui.show_popup('recharge_membership_card_popup',{'recharge_card_data':self.recharge_card})
            }else if(self.options){
                self.gui.show_popup('create_membership_card_popup',{'card_data':self.options});
            }

        }
    });
    gui.define_popup({name:'confirmation_membership_card_payment', widget: ConfirmationMembershipCardPayment})

var PaymentInfoWidget = PopupWidget.extend({
    template: 'PaymentInfoWidget',
    show: function(options){
        options = options || {};
        this._super(options);
        this.renderElement();
        $('body').off('keypress', this.keyboard_handler);
        $('body').off('keydown', this.keyboard_keydown_handler);
        window.document.body.addEventListener('keypress',this.keyboard_handler);
        window.document.body.addEventListener('keydown',this.keyboard_keydown_handler);
        if(options.data){
            var data = options.data;
            this.$('input[name=payment_ref]').val(data.payment_ref);
        }
    },
    click_confirm: function(){
        if (this.$('input[name=payment_ref]').val() == ''){
            alert("Please Enter Payment Reference");
        }
        else{
            var infos = {
                'payment_ref' : this.$('input[name=payment_ref]').val(),
                'note':this.pos.get_order().note || "" ,
            };
            var valid = true;
            if(this.options.validate_info){
                valid = this.options.validate_info.call(this, infos);
            }

            this.gui.close_popup();
            if( this.options.confirm ){
                this.options.confirm.call(this, infos);
            }
        }
    },
});
gui.define_popup({name:'payment-info-input', widget: PaymentInfoWidget});

});
