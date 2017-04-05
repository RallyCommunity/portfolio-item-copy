var app = null;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    layout : {
        type : "table",
        columns : 2
    },
    
    config: {
        defaultSettings: {
            portfolioitem : [''],
            hierarchicalrequirement : ["ScheduleState","PlanEstimate"],
            task : ["State","Estimate","TaskIndex","ToDo","Actuals"],
            preserve_rank: true,
            allow_current_project: false,
            ignore_state: false
        }
    },

    items:[ 
        {
            xtype : "label",
            text : 'Copy To Project:',
            padding : "5px"
        },

        {
            id : "project-picker",
            xtype: 'rallyprojectpicker',
            margin: "5px",
            model: 'Project',
            field: 'Name',
            listeners: {
                change: function() {
                    app.setSummary();
                }
            }
        },
        {
            xtype : "rallybutton",
            id   : 'select-pi-button',
            text : "Select Portfolio Item",
            margin: "5px",
            handler : function() {
                app.chooseItem();
            }
        },
        {
            id : "item-label",
            xtype : "label",
            margin : 5,
            style : "font-weight:bold;",
            text : ""
        },
        {
            itemId: 'release-label',
            xtype:'label',
            padding: 5,
            text: ''
        
        },
        {
            itemId: 'release-chooser',
            xtype: 'container',
            margin: 5
        },
        {
            id : "copy-button",
            xtype : "rallybutton",
            text : "Copy",
            margin: "5px",
            disabled : true,
            handler : function() {
                app.performCopy();
            }
        },
        {
            id : "summary",
            xtype : "container",
            margin : "5px",
            style : "font-weight:bold;",
            html : ""
    }],

    _ignoreFields: {
        'hierarchicalrequirement': ['FlowState'],
        'task': [],
        'portfolioitem': []
    },
    
    launch: function() {
        app = this;
        var fieldsToCopy = { 
            portfolioitem : this.getSetting('portfolioitem'),
            hierarchicalrequirement : this.getSetting('hierarchicalrequirement'),
            task: this.getSetting('task')
        };
        
        // cleanse because sometimes they aren't arrays coming back
        if ( !Ext.isEmpty(fieldsToCopy.portfolioitem) && !Ext.isArray(fieldsToCopy.portfolioitem) ){
            fieldsToCopy.portfolioitem = fieldsToCopy.portfolioitem.split(',');
        }
        
        if ( !Ext.isEmpty(fieldsToCopy.hierarchicalrequirement) && !Ext.isArray(fieldsToCopy.hierarchicalrequirement) ){
            fieldsToCopy.hierarchicalrequirement = fieldsToCopy.hierarchicalrequirement.split(',');
        }
        
        if ( !Ext.isEmpty(fieldsToCopy.task) && !Ext.isArray(fieldsToCopy.task) ){
            fieldsToCopy.task = fieldsToCopy.task.split(',');
        }
        
        if ( app.getSetting('allow_current_project') && app.getSetting('allow_current_project') != "false" ) {
            var current_project_ref = app.getContext().getProjectRef();
            app.down("#project-picker").setValue(current_project_ref);
        }
        
        if ( app.getSetting('ignore_state') && app.getSetting('ignore_state') != "false" ) {
            app._ignoreFields.hierarchicalrequirement.push('ScheduleState');
            app._ignoreFields.task.push('State');
        }

        app.setSummary();
        
        app.fieldsToCopy = fieldsToCopy;
        
        this._getRequiredFields().then({
            scope: this,
            success: function(requiredFields) {
                app.requiredFields = requiredFields;
                // make sure required fields are part of the settings:
                Ext.apply(app.fieldsToCopy, requiredFields);
                
                if ( Ext.Array.contains( requiredFields.hierarchicalrequirement, 'Release' )) {
                    this.down('#release-label').setText('Default Release:');
                    
                    this.down('#release-chooser').removeAll();
                    this.down('#release-chooser').add({
                        xtype:'rallyreleasecombobox',
                        showArrows: false
                    });
                }
            }
        });
    },
    
    isDisallowedProject: function(value) {
        if ( Ext.isEmpty(value) ) { 
            return "Must choose a project";
        }
        if ( app.getSetting('allow_current_project') && app.getSetting('allow_current_project') != "false" ) {
            return false;
        }
        var current_project_ref = app.getContext().getProjectRef();
        if ( current_project_ref == value ) {
            return "Cannot choose current project.";
        }
        return false;
        
    },
    
    setSummary: function() {
        var summary_box = app.down('#summary');
        var go_button = app.down("#copy-button");
                    
        if ( Ext.isEmpty(summary_box) ) { return; }
        
        go_button.setDisabled(true);
        summary_box.removeAll();
        
        var project_ref = app.down("#project-picker").getValue();
        var error = app.isDisallowedProject(project_ref);
        
        var summary_array = [] ;
        if ( error ) { summary_array.push({xtype:'container', html: error}); }
        
        if ( app.list && app.list.length > 0 ) {
            summary_array.push({xtype:'container', html: app.list.length + " Items to be copied"});
        }
        summary_box.add(summary_array);
        
        if ( app.list && app.list.length > 0 && !error ) {
            go_button.setDisabled(false);
        }
    },
    
    updateSummary: function(msg) {
        var summary_box = app.down('#summary');
                    
        if ( Ext.isEmpty(summary_box) ) { return; }
        
        summary_box.removeAll();
        summary_box.add({xtype:'container', html: msg});
    },

    // displays a chooser to select the portfolio item
    chooseItem : function() {

        Ext.create('Rally.ui.dialog.ChooserDialog', {
            artifactTypes: ['PortfolioItem'],
            autoShow: true,
            
            title: 'Choose Item',
            listeners: {
                artifactChosen: function(selectedRecord){
                    this.down("#item-label").setText(selectedRecord.get('Name'));
                    this.down("#copy-button").setDisabled(true);
                    app.itemSelected(selectedRecord);

                },
                scope: this
            }
        });
    },

    // called when a portfolio item is chosen. It creates the list of items to be copied and
    // updates the summary message.
    itemSelected : function(root) {
        app.down('#summary').setLoading("");
        
        var config = {   
            model : "PortfolioItem",
            fetch : true,
            filters : [ { property : "ObjectID", operator : "=", value: root.get("ObjectID") } ]
        };

        // create a list of all items to be copied
        async.map([config], app.wsapiQuery,function(err,results){
            var item = results[0][0];
            app.list = [];

            async.map([item],app.createList,function(err,results){
                app.models = {};
                // get the distinct set of types from the list.
                app.types = _.uniq(_.map( app.list, function(l) { return l.get("_type");}));
                // load the models for the types
                async.mapSeries(app.types,app.loadModel,function(err,results) {
                    // save the loaded models to an array
                    _.each(app.types,function(t,i) {
                        app.models[t] = results[i];
                    });
                    
                    app.down('#summary').setLoading(false);
                    app.setSummary();

                });
            });
        });
    },

    // performs the copy of items in the list by asynchronously calling copyItem for each item
    // in the list
    performCopy : function() {
        app.down("#copy-button").setDisabled(true);
        app.down("#select-pi-button").setDisabled(true);
                    
        app.copyList = {};
        app.projectRef = app.down("#project-picker").getValue();
        
        async.mapSeries(app.list,app.copyItem,function(err,results) {
            if (err===null) {
                app.updateSummary(results.length + " Items copied to " + results[0].get("FormattedID"));
            } else {
                app.updateSummary(err);
            }
            app.down("#copy-button").setDisabled(false);
            app.down("#select-pi-button").setDisabled(false);

        });
    },

    // copies a single item
    copyItem : function(i,callback) {

        var copy = {
            "Name": i.get("Name"),
            "Workspace" : i.get("Workspace")._ref,
            // "Description" : encodeURI(i.get("Description")),
            "Description" : i.get("Description"),
            "Owner" : i.get("Owner") !== null ? i.get("Owner")._ref : null,
            // "Project" : app.projectRef
            "DisplayColor" : !_.isNull(i.get("DisplayColor")) && !_.isUndefined(i.get("DisplayColor")) ?
                i.get("DisplayColor") : null
        };

        copy = app.copyTypeSpecificFields(copy,i);

        var parentRef = app.parentRef(i);
        if (parentRef!==null) {
            var mappedRef = app.copyList[parentRef.ref];
            if (!_.isUndefined(mappedRef)) {
                copy[parentRef.type] = mappedRef;
            }
        }

        var model = app.models[i.get("_type")];
        async.map([{model:model,copy:copy,source:i}],app.createItem,function(err,results){
            if (!_.isUndefined(err)&&!_.isNull(err)) {
                callback(err,null);    
            } else {
                callback(null,results[0]);
            }
        });
    },

    copyTypeSpecificFields : function(copy,item) {
        var type = item.get("_type").toLowerCase().indexOf("portfolioitem") !== -1 ?
                        "portfolioitem" :
                        item.get("_type");
        
        reference_fields = ['Release','Iteration','Owner'];

        Ext.Array.each( this.fieldsToCopy[type], function(field) {
            var item_release = this._getRelease(item);
            if ( !Ext.isEmpty(item_release) && Ext.Array.contains(reference_fields, field) ) {
                copy[field] = { _ref: item_release._ref };
            } else {
                copy[field] = item.get(field);
            }
        }, this);

        // handle tags.
        if (item.get("Tags").Count > 0) {
            var tags = _.map(item.get("Tags")._tagsNameArray,function(t) {
                return { _ref : t._ref };
            });
            copy.Tags = tags;
        }

        return copy;
    },
    
    _getRelease: function(item) {
        var release = item.get('Release');
        if ( Ext.isEmpty(release) && this.down('rallyreleasecombobox' )) {
            release = this.down('rallyreleasecombobox').getRecord().getData();
        }
        return release;
    },
    

    // creates the new item
    createItem : function(item,callback) {        
        var rec = Ext.create(item.model, item.copy );
        // set the destination project
        rec.set("Project",app.projectRef);
        rec.save(
        {
            callback: function(result, operation) {
                if (operation.success===true) {
                    app.copyList[item.source.get("_ref")] = result.get("_ref");
                    app.updateSummary("Created " + result.get("FormattedID"));
                    
                    callback(null,result);
                } else { 
                    console.log("Error:",operation);
                    var message = "<span class='icon-warning'> </span>Create Error when copying " + item.copy.Name;
                    if (! Ext.isEmpty( operation.error ) && ! Ext.isEmpty( operation.error.errors) ) {
                        message += ":<br/>" + operation.error.errors.join('<br/>');
                    }
                    callback(message,null);
                }
            }
        });

    },

    // reads a rally collection object
    readCollection : function( collectionConfig, callback ) {
        var rank_field = Rally.data.Ranker.getRankField(collectionConfig.reference);
        var direction = collectionConfig.direction;
        
        collectionConfig.reference.getCollection(collectionConfig.type,{
            fetch:true,
            sorters: [ { property: rank_field, direction: direction} ]
        }).load({
            fetch : true,
            callback : function(records,operation,success) {
                callback(null,records);
            }
        });

    },

    // recursive method to create a list of all items to be copied.
    createList : function(root,callback) {
        
        var config = {   
            model : root.raw._type,
            fetch : true,
            filters : [ { property : "ObjectID", operator : "=", value: root.get("ObjectID") } ]
        };

        async.map([config], wsapiQuery, function(err,results) {

            var obj = results[0][0];
            var direction = "DESC";
            
            if ( Ext.isEmpty(obj) ) {
                callback(null,[]);
                return;
            }
                        
            app.list.push(obj);

            var childRef = null;
            if (app.defined(obj.get("Tasks"))) {
                childRef = "Tasks";
                direction = "DESC";
            } else {
                if (app.defined(obj.get("Children"))){
                    childRef = "Children";
                    if ( /PortfolioItem/.test(root.raw._type)){
                        direction = "ASC";
                    }
                    
                } else {
                    if (app.defined(obj.get("UserStories"))) {
                        childRef = "UserStories";
                    } 
                }
            }

            if (app.isObject(childRef)) {
                var config = { reference : obj, type : childRef, direction: direction };
                if ( app.getSetting('preserve_rank') && app.getSetting('preserve_rank') != "false" ) {
                    async.mapSeries([config],app.readCollection,function(err,results){
                        var children = results[0];
                        async.mapSeries(children,app.createList,function(err,results){
                            callback(null,results);
                        });
                    });
                } else {
                    async.map([config],app.readCollection,function(err,results){
                        var children = results[0];
                        async.map(children,app.createList,function(err,results){
                            callback(null,results);
                        });
                    });
                }
            } else {
                callback(null,obj);
            }
        });
    },

    // return the type of parent reference
    parentRef : function(obj) {

        if ( _.isObject(obj.get("Parent"))) {
            return { type : "Parent", ref :  obj.get("Parent")._ref };
        }
        if ( _.isObject(obj.get("WorkProduct"))) {
            return { type : "WorkProduct", ref : obj.get("WorkProduct")._ref };
        }
        if ( _.isObject(obj.get("PortfolioItem"))) {
            return { type : "PortfolioItem", ref : obj.get("PortfolioItem")._ref };
        }
        return null;

    },

    // loads a single rally model for the type
    loadModel : function(type,callback) {

        Rally.data.ModelFactory.getModel({
            type: type,
            success: function(model) {
                callback(null,model);
            }
        });
    },

    isObject : function(obj) {
        return ( !_.isUndefined(obj) && !_.isNull(obj) );
    },

    defined : function (obj) {
        return (app.isObject(obj) && obj.Count > 0) ;
    },

    wsapiQuery : function( config , callback ) {
    
        Ext.create('Rally.data.WsapiDataStore', {
            autoLoad : true,
            limit : "Infinity",
            model : config.model,
            fetch : config.fetch,
            filters : config.filters,
            sorters: config.sorters,
            listeners : {
                scope : this,
                load : function(store, data) {
                    callback(null,data);
                }
            }
        });
    },

    _getRequiredFields: function() {
        var deferred = Ext.create('Deft.Deferred');
        
        Deft.Promise.all([
            this._getRequiredFieldsForModel('portfolioitem'),
            this._getRequiredFieldsForModel('hierarchicalrequirement'),
            this._getRequiredFieldsForModel('task')
        ]).then({
            scope: this,
            success: function(results) {
                deferred.resolve({
                    'portfolioitem': results[0],
                    'hierarchicalrequirement': results[1],
                    'task': results[2]
                });
            }
        });
        return deferred.promise;
    },
    
    _isValidField: function(field,model_name) {
        if (Ext.Array.contains(app._ignoreFields[model_name],field.name)) {
            return false;
        }
        
        return ( field.required && !field.readOnly );
    },
    
    _getRequiredFieldsForModel: function(model_name) {
        var deferred = Ext.create('Deft.Deferred');
        Rally.data.ModelFactory.getModel({
            type: model_name,
            success: function(model) {
                var fields = model.getFields();
                var required_fields = [];
                Ext.Array.each(fields, function(field){
                    if ( app._isValidField(field,model_name) ) {
                        required_fields.push(field.name);
                    }
                });
                deferred.resolve( required_fields );
            }
        });
        return deferred.promise;
    },
    
    getSettingsFields: function() {
        return [
            {
                name: 'preserve_rank',
                xtype: 'rallycheckboxfield',
                margin: '10px 0 10px 0',
                fieldLabel: 'Keep Rank (slower)'
            },
            {
                name: 'allow_current_project',
                xtype: 'rallycheckboxfield',
                margin: '10px 0 10px 0',
                fieldLabel: 'Allow Into Current Project'
            },
            {
                name: 'ignore_state',
                xtype: 'rallycheckboxfield',
                margin: '10px 0 10px 0',
                fieldLabel: 'Skip State Fields'
            },
            {
            name: 'portfolioitem',
            xtype: 'rallyfieldpicker',
            autoExpand: true,
            alwaysExpanded: false,
            modelTypes: ['PortfolioItem/Feature'],
            margin: '10px 0 10px 0',
            fieldLabel: 'Feature Fields',
            _shouldShowField: function(field) {
                //console.log(field.name, field);
                var attr = field.attributeDefinition;
                //console.log('...',attr);
                
                return attr && !attr.ReadOnly && attr.AttributeType !== 'COLLECTION';
            },
            listeners: {
                ready: function(picker){ picker.collapse(); }
            },
            readyEvent: 'ready' 
            
        },
        {
            name: 'hierarchicalrequirement',
            xtype: 'rallyfieldpicker',
            autoExpand: true,
            alwaysExpanded: false,
            modelTypes: ['HierarchicalRequirement'],
            margin: '10px 0 10px 0',
            fieldLabel: 'Story Fields',
            _shouldShowField: function(field) {
                //console.log(field.name, field);
                var attr = field.attributeDefinition;
                //console.log('...',attr);
                
                return attr && !attr.ReadOnly && attr.AttributeType !== 'COLLECTION';
            },
            listeners: {
                ready: function(picker){ picker.collapse(); }
            },
            readyEvent: 'ready' 
        },
        {
            name: 'task',
            xtype: 'rallyfieldpicker',
            autoExpand: true,
            alwaysExpanded: false,
            modelTypes: ['Task'],
            margin: '10px 0 200px 0',
            fieldLabel: 'Task Fields',
            _shouldShowField: function(field) {
                //console.log(field.name, field);
                var attr = field.attributeDefinition;
                //console.log('...',attr);
                
                return attr && !attr.ReadOnly && attr.AttributeType !== 'COLLECTION';
            },
            listeners: {
                ready: function(picker){ picker.collapse(); }
            },
            readyEvent: 'ready' 
        }];
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        console.log('onSettingsUpdate',settings);
        Ext.apply(this, settings);
        
        this.launch();
    }
    

});
